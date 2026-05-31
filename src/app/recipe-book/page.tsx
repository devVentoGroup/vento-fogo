import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

type Relation<T> = T | T[] | null | undefined;

type ProductShape = {
  id?: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  image_url?: string | null;
  catalog_image_url?: string | null;
};

type AreaShape = {
  id: string;
  code?: string | null;
  name: string | null;
  kind: string | null;
  site_id?: string | null;
};

type RecipeCardRow = {
  id: string;
  product_id: string;
  site_id: string | null;
  area_id: string | null;
  yield_qty: number;
  yield_unit: string;
  portion_size: number | null;
  portion_unit: string | null;
  prep_time_minutes: number | null;
  shelf_life_days: number | null;
  difficulty: string | null;
  recipe_description: string | null;
  cover_image_path: string | null;
  status: string;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientRow = {
  ingredient_product_id: string;
  quantity: number | null;
  products?: Relation<ProductShape & { cost: number | null }>;
};

type StepRow = {
  id: string;
  step_number: number;
  description: string;
  tip: string | null;
  time_minutes: number | null;
  image_path: string | null;
};

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value))}`;
}

function imageUrl(recipe: RecipeCardRow | null) {
  if (!recipe) return "";
  const product = one(recipe.products);
  return recipe.cover_image_path || product?.catalog_image_url || product?.image_url || "";
}

function productImage(product: ProductShape | null | undefined) {
  return product?.catalog_image_url || product?.image_url || "";
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Simple";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
  return value;
}

function isDraftStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "draft";
}

function isPublishedStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "published";
}

function areaLabel(area: AreaShape | null | undefined) {
  return area?.name || area?.kind || "Sin area";
}

const PRODUCTION_RECIPE_AREA_KINDS = ["bodega", "cocina_caliente", "panaderia", "reposteria"];
const PRODUCTION_RECIPE_AREA_ORDER = new Map(
  PRODUCTION_RECIPE_AREA_KINDS.map((kind, index) => [kind, index])
);
const PRODUCTION_RECIPE_AREA_CODES = new Set(["BODEGA", "COC-CAL", "PAN-GALL", "REPOSTERIA"]);
const PRODUCTION_RECIPE_AREA_SLUGS = new Set([
  "bodega",
  "bodega_principal",
  "cocina_caliente",
  "galleteria_y_panaderia",
  "reposteria",
]);

function normalizeSlug(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isStandalonePanaderiaArea(area: AreaShape) {
  const code = String(area.code ?? "").trim().toUpperCase();
  const slug = normalizeSlug(area.name);
  return code === "PAN" || code === "PANADERIA" || slug === "panaderia";
}

function isProductionRecipeArea(area: AreaShape, allowedKinds: Set<string>) {
  const code = String(area.code ?? "").trim().toUpperCase();
  const kind = String(area.kind ?? "").trim();
  const slug = normalizeSlug(area.name);
  return (
    !isStandalonePanaderiaArea(area) &&
    (allowedKinds.has(kind) ||
      PRODUCTION_RECIPE_AREA_CODES.has(code) ||
      PRODUCTION_RECIPE_AREA_SLUGS.has(slug))
  );
}

function sortProductionAreas(a: AreaShape, b: AreaShape) {
  const areaOrder = (area: AreaShape) => {
    const kindOrder = PRODUCTION_RECIPE_AREA_ORDER.get(String(area.kind ?? ""));
    if (kindOrder != null) return kindOrder;
    const code = String(area.code ?? "").trim().toUpperCase();
    const slug = normalizeSlug(area.name);
    if (code === "BODEGA" || slug === "bodega" || slug === "bodega_principal") return 0;
    if (code === "COC-CAL" || slug === "cocina_caliente") return 1;
    if (code === "PAN-GALL" || slug === "galleteria_y_panaderia") return 2;
    if (code === "REPOSTERIA" || slug === "reposteria") return 3;
    return 999;
  };
  const aOrder = areaOrder(a);
  const bOrder = areaOrder(b);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a.name ?? a.code ?? "").localeCompare(String(b.name ?? b.code ?? ""), "es");
}

function recipeHref(params: {
  siteId: string;
  areaId?: string | null;
  recipeId?: string | null;
  qty?: number | null;
}) {
  const qs = new URLSearchParams();
  if (params.siteId) qs.set("site_id", params.siteId);
  if (params.areaId) qs.set("area_id", params.areaId);
  if (params.recipeId) qs.set("recipe_id", params.recipeId);
  if (params.qty && params.qty > 0) qs.set("qty", String(params.qty));
  return `/recipe-book${qs.toString() ? `?${qs.toString()}` : ""}`;
}

function mergeAreas(primary: AreaShape[], recipes: RecipeCardRow[]) {
  const map = new Map<string, AreaShape>();
  for (const area of primary) {
    if (area?.id) map.set(area.id, area);
  }
  for (const recipe of recipes) {
    const area = one(recipe.areas);
    if (area?.id && !map.has(area.id)) map.set(area.id, area);
  }
  return Array.from(map.values());
}

export default async function RecipeBookPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    recipe_id?: string;
    qty?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedAreaId = String(sp.area_id ?? "").trim();
  const requestedRecipeId = String(sp.recipe_id ?? "").trim();
  const requestedQty = Number(String(sp.qty ?? "").trim());

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipe-book",
    permissionCode: "production.recipe_book.view",
  });

  const [{ data: currentSite }, { data: currentArea }, { data: employeeRow }] = await Promise.all([
    supabase.rpc("current_employee_site_id"),
    supabase.rpc("current_employee_area_id"),
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const siteId = requestedSiteId || String(currentSite ?? "");
  const role = String(employeeRow?.role ?? "").trim();
  const isManagement = ["propietario", "gerente_general", "gerente"].includes(role);

  const [{ data: rpcAreasData }, { data: recipeRowsData }] = await Promise.all([
    siteId
      ? supabase.rpc("fogo_recipe_area_options", { p_site_id: siteId })
      : Promise.resolve({ data: [] as AreaShape[] }),
    (() => {
      let query = supabase
        .from("recipe_cards")
        .select(
          "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,status,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,code,name,kind,site_id)"
        )
        .eq("is_active", true)
        .in("status", isManagement ? ["published", "draft"] : ["published"])
        .order("updated_at", { ascending: false })
        .limit(240);
      if (siteId) query = query.eq("site_id", siteId);
      return query;
    })(),
  ]);

  let recipeAreasData = (rpcAreasData ?? []) as AreaShape[];
  if (siteId && recipeAreasData.length === 0) {
    const { data: fallbackAreasData } = await supabase
      .from("areas")
      .select("id,code,name,kind,site_id")
      .eq("site_id", siteId)
      .eq("is_active", true);
    recipeAreasData = (fallbackAreasData ?? []) as AreaShape[];
  }

  const allRecipes = (recipeRowsData ?? []) as RecipeCardRow[];
  const allowedAreaKinds = new Set(PRODUCTION_RECIPE_AREA_KINDS);
  const areas = mergeAreas(recipeAreasData, allRecipes)
    .filter((area) => isProductionRecipeArea(area, allowedAreaKinds) || allRecipes.some((recipe) => recipe.area_id === area.id))
    .sort(sortProductionAreas);

  const recipeCountByArea = new Map<string, number>();
  for (const recipe of allRecipes) {
    const areaId = String(recipe.area_id ?? "");
    if (!areaId) continue;
    recipeCountByArea.set(areaId, (recipeCountByArea.get(areaId) ?? 0) + 1);
  }

  const currentAreaId = String(currentArea ?? "");
  const currentAreaHasRecipes = currentAreaId && (recipeCountByArea.get(currentAreaId) ?? 0) > 0;
  const requestedAreaIsValid = requestedAreaId && areas.some((area) => area.id === requestedAreaId);
  const selectedAreaId = requestedAreaIsValid
    ? requestedAreaId
    : isManagement
      ? ""
      : currentAreaHasRecipes
        ? currentAreaId
        : "";

  const recipes = allRecipes.filter((recipe) =>
    selectedAreaId ? recipe.area_id === selectedAreaId : true
  );
  const selectedRecipe =
    recipes.find((recipe) => recipe.id === requestedRecipeId) ?? recipes[0] ?? null;
  const selectedProduct = one(selectedRecipe?.products);
  const selectedArea =
    one(selectedRecipe?.areas) ?? areas.find((area) => area.id === selectedAreaId) ?? null;
  const productionQty =
    Number.isFinite(requestedQty) && requestedQty > 0
      ? requestedQty
      : Number(selectedRecipe?.yield_qty ?? 0) || 1;
  const scaleFactor =
    selectedRecipe && Number(selectedRecipe.yield_qty) > 0
      ? productionQty / Number(selectedRecipe.yield_qty)
      : 1;

  const canCreateBatch = await checkPermission(supabase, APP_ID, "production.batches.create", {
    siteId,
    areaId: selectedAreaId || selectedRecipe?.area_id || null,
  });

  const [{ data: ingredientRows }, { data: stepRows }] = selectedRecipe
    ? await Promise.all([
        supabase
          .from("recipes")
          .select(
            "ingredient_product_id,quantity,products(id,name,sku,unit,stock_unit_code,cost,image_url,catalog_image_url)"
          )
          .eq("product_id", selectedRecipe.product_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("recipe_steps")
          .select("id,step_number,description,tip,time_minutes,image_path")
          .eq("recipe_card_id", selectedRecipe.id)
          .order("step_number", { ascending: true }),
      ])
    : [{ data: [] as IngredientRow[] }, { data: [] as StepRow[] }];

  const ingredients = (ingredientRows ?? []) as IngredientRow[];
  const steps = (stepRows ?? []) as StepRow[];
  const totalCost = ingredients.reduce((acc, row) => {
    const product = one(row.products);
    const qty = Number(row.quantity ?? 0) * scaleFactor;
    const cost = Number(product?.cost ?? 0);
    return acc + (Number.isFinite(qty * cost) ? qty * cost : 0);
  }, 0);

  const firstStepImage = steps.find((step) => step.image_path)?.image_path ?? "";
  const coverImage = imageUrl(selectedRecipe) || firstStepImage;
  const hasRecipes = allRecipes.length > 0;
  const selectedAreaName = selectedArea ? areaLabel(selectedArea) : selectedAreaId ? "Area" : "Todas las areas";
  const baseYield = `${fmt(selectedRecipe?.yield_qty)} ${selectedRecipe?.yield_unit ?? "-"}`;
  const targetYield = `${fmt(productionQty)} ${selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "-"}`;
  const totalMinutes = steps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
  const selectedRecipeIsDraft = isDraftStatus(selectedRecipe?.status);
  const selectedRecipeIsPublished = isPublishedStatus(selectedRecipe?.status);
  const visibleRecipeTypeText = isManagement ? "publicadas y borradores" : "publicadas";

  if (!hasRecipes) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] shadow-[var(--ui-shadow-2)]">
          <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_340px]">
            <div>
              <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                Recetario FOGO
              </span>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-[var(--ui-text)] md:text-6xl">
                No hay recetas visibles
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ui-muted)] md:text-lg">
                Cuando una receta este disponible para tu rol, aparecera aqui como ficha visual para que el equipo pueda revisarla o producirla paso a paso.
              </p>
            </div>
            <div className="rounded-2xl border border-[#FDBA74] bg-white p-5 shadow-[var(--ui-shadow-soft)]">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Siguiente accion</div>
              <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">
                Crea o publica una receta desde el administrador de recetas.
              </p>
              {isManagement ? (
                <Link href="/recipes" className="ui-btn ui-btn--brand ui-btn--sm mt-4 w-full">
                  Ir a recetas
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[var(--ui-radius-card)] border border-[#E5D6C5] bg-[#FFFDFC] shadow-[var(--ui-shadow-2)]">
        <div className="grid min-h-[460px] lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative flex min-h-[460px] flex-col justify-end overflow-hidden bg-[#1F2937] p-6 text-white md:p-8">
            {coverImage ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(\"${coverImage}\")` }}
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#111827_0%,#7C2D12_48%,#F97316_100%)]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.12)_0%,rgba(17,24,39,0.86)_100%)]" />
            <div className="relative max-w-4xl">
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                  Recetario FOGO
                </span>
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  {selectedAreaName}
                </span>
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  {recipes.length} recetas {visibleRecipeTypeText}
                </span>
                {isManagement && selectedRecipeIsDraft ? (
                  <span className="rounded-full border border-[#FDBA74] bg-[#FFF7ED] px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                    Borrador
                  </span>
                ) : null}
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] text-white md:text-6xl">
                {selectedProduct?.name ?? "Selecciona una receta"}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/88 md:text-lg">
                {selectedRecipe?.recipe_description ||
                  "Ficha visual de produccion con cantidades listas, ingredientes claros y paso a paso para ejecutar en cocina."}
              </p>
              {isManagement && selectedRecipeIsDraft ? (
                <p className="mt-4 max-w-2xl rounded-2xl border border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-sm font-semibold leading-6 text-[#C2410C]">
                  Esta receta esta en borrador. Puedes revisarla, pero no se puede producir hasta publicarla.
                </p>
              ) : null}
            </div>
          </div>

          <aside className="flex flex-col justify-between border-t border-[#E5D6C5] bg-white p-6 lg:border-l lg:border-t-0 md:p-7">
            <div>
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Produccion de hoy</div>
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">Cantidad objetivo</div>
                  <div className="mt-2 text-4xl font-semibold text-[var(--ui-text)]">{targetYield}</div>
                  <div className="mt-2 text-sm text-[var(--ui-muted)]">Base original: {baseYield}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--ui-border)] bg-[#FBFCFD] p-4">
                    <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Tiempo</div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                      {selectedRecipe?.prep_time_minutes
                        ? `${fmt(selectedRecipe.prep_time_minutes, 0)} min`
                        : totalMinutes > 0
                          ? `${fmt(totalMinutes, 0)} min`
                          : "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--ui-border)] bg-[#FBFCFD] p-4">
                    <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Nivel</div>
                    <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                      {difficultyLabel(selectedRecipe?.difficulty)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-3 rounded-2xl border border-[#E5D6C5] bg-[#FFFDFC] p-4">
              {siteId ? <input type="hidden" name="site_id" value={siteId} /> : null}
              {selectedAreaId ? <input type="hidden" name="area_id" value={selectedAreaId} /> : null}
              {selectedRecipe ? <input type="hidden" name="recipe_id" value={selectedRecipe.id} /> : null}
              <label>
                <span className="ui-label">
                  Cambiar cantidad ({selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "un"})
                </span>
                <input
                  className="ui-input mt-1 bg-white text-xl font-semibold"
                  type="number"
                  min="0.01"
                  step="0.01"
                  name="qty"
                  defaultValue={productionQty}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                  Recalcular
                </button>
                {canCreateBatch && selectedRecipe && selectedRecipeIsPublished ? (
                  <Link
                    href={`/production-batches/new?recipe_id=${encodeURIComponent(selectedRecipe.id)}&qty=${encodeURIComponent(String(productionQty))}`}
                    className="ui-btn ui-btn--primary ui-btn--sm"
                  >
                    Producir
                  </Link>
                ) : (
                  <span className="ui-btn ui-btn--ghost ui-btn--sm pointer-events-none opacity-70">
                    {selectedRecipeIsDraft ? "Borrador" : "Solo lectura"}
                  </span>
                )}
              </div>
            </form>
          </aside>
        </div>
      </section>

      <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="ui-h2">Elegir area</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">Vista rapida para encontrar la receta correcta.</p>
          </div>
          {isManagement ? (
            <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm">
              Admin recetas
            </Link>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Link
            href={recipeHref({ siteId })}
            className={`shrink-0 rounded-2xl border px-4 py-3 transition ${
              !selectedAreaId
                ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                : "border-[var(--ui-border)] bg-[#FBFCFD] hover:border-[#FDBA74] hover:bg-white"
            }`}
          >
            <div className="text-sm font-semibold text-[var(--ui-text)]">Todas</div>
            <div className="mt-1 text-2xl font-semibold text-[#C2410C]">{allRecipes.length}</div>
          </Link>
          {areas.map((area) => {
            const count = recipeCountByArea.get(area.id) ?? 0;
            return (
              <Link
                key={area.id}
                href={recipeHref({ siteId, areaId: area.id })}
                className={`shrink-0 rounded-2xl border px-4 py-3 transition ${
                  area.id === selectedAreaId
                    ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                    : "border-[var(--ui-border)] bg-[#FBFCFD] hover:border-[#FDBA74] hover:bg-white"
                }`}
              >
                <div className="max-w-[180px] truncate text-sm font-semibold text-[var(--ui-text)]">
                  {areaLabel(area)}
                </div>
                <div className="mt-1 text-2xl font-semibold text-[#C2410C]">{count}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <div className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="ui-h2">Recetas</h2>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">Toca una tarjeta para verla.</p>
              </div>
              <span className="ui-chip ui-chip--brand">{recipes.length}</span>
            </div>
            <div className="mt-4 grid gap-3">
              {recipes.map((recipe) => {
                const product = one(recipe.products);
                const area = one(recipe.areas);
                const thumb = imageUrl(recipe);
                const active = recipe.id === selectedRecipe?.id;
                const isDraft = isDraftStatus(recipe.status);
                return (
                  <Link
                    key={recipe.id}
                    href={recipeHref({
                      siteId,
                      areaId: selectedAreaId,
                      recipeId: recipe.id,
                      qty: productionQty,
                    })}
                    className={`grid grid-cols-[92px_1fr] gap-3 rounded-2xl border p-3 transition ${
                      active
                        ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                        : "border-[var(--ui-border)] bg-[#FBFCFD] hover:border-[#FDBA74] hover:bg-white"
                    }`}
                  >
                    <div
                      className="h-[92px] overflow-hidden rounded-xl bg-[#FFF7ED] bg-cover bg-center"
                      style={thumb ? { backgroundImage: `url(\"${thumb}\")` } : undefined}
                    >
                      {!thumb ? (
                        <div className="flex h-full items-center justify-center text-xl font-semibold text-[#C2410C]">
                          {String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R"}
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 py-1">
                      <div className="line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">
                        {product?.name ?? "Producto"}
                      </div>
                      <div className="mt-2 text-xs text-[var(--ui-muted)]">{areaLabel(area)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#C2410C]">
                          {fmt(recipe.yield_qty)} {recipe.yield_unit}
                        </span>
                        {isManagement && isDraft ? (
                          <span className="inline-flex rounded-full border border-[#FDBA74] bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                            Borrador
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {recipes.length === 0 ? (
                <div className="ui-empty">Esta area no tiene recetas visibles para tu rol.</div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">1. Alistar</div>
                <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Ingredientes</h2>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Costo estimado</div>
                <div className="text-2xl font-semibold text-[#C2410C]">{money(totalCost)}</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {ingredients.map((row, index) => {
                const product = one(row.products);
                const thumb = productImage(product);
                const requiredQty = Number(row.quantity ?? 0) * scaleFactor;
                const unit = product?.stock_unit_code || product?.unit || "-";
                return (
                  <div
                    key={`${row.ingredient_product_id}-${index}`}
                    className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-2xl border border-[var(--ui-border)] bg-[#FBFCFD] p-3"
                  >
                    <div
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-[#FFF7ED] bg-cover bg-center text-lg font-semibold text-[#C2410C]"
                      style={thumb ? { backgroundImage: `url(\"${thumb}\")` } : undefined}
                    >
                      {!thumb ? index + 1 : null}
                    </div>
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">
                        {product?.name ?? "Ingrediente"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-[var(--ui-text)]">{fmt(requiredQty, 3)}</div>
                      <div className="text-xs font-semibold text-[#C2410C]">{unit}</div>
                    </div>
                  </div>
                );
              })}
              {ingredients.length === 0 ? (
                <div className="ui-empty md:col-span-2">Esta receta aun no tiene ingredientes publicados.</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">2. Preparar</div>
                <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Paso a paso</h2>
              </div>
              <span className="ui-chip">{steps.length} pasos</span>
            </div>
            <div className="mt-6 space-y-5">
              {steps.map((step) => (
                <article
                  key={step.id}
                  className="overflow-hidden rounded-3xl border border-[#E5D6C5] bg-[#FFFDFC] shadow-[var(--ui-shadow-soft)]"
                >
                  <div className="grid md:grid-cols-[360px_1fr]">
                    <div
                      className="min-h-[260px] bg-[#FFF7ED] bg-cover bg-center"
                      style={step.image_path ? { backgroundImage: `url(\"${step.image_path}\")` } : undefined}
                    >
                      {!step.image_path ? (
                        <div className="flex h-full min-h-[260px] items-center justify-center text-base font-semibold text-[#C2410C]">
                          Foto pendiente
                        </div>
                      ) : null}
                    </div>
                    <div className="p-6 md:p-7">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-2xl font-semibold text-white">
                          {step.step_number}
                        </span>
                        {step.time_minutes != null ? (
                          <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-sm font-semibold text-[#C2410C]">
                            {fmt(step.time_minutes, 0)} min
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-5 text-xl leading-9 text-[var(--ui-text)]">{step.description}</p>
                      {step.tip ? (
                        <p className="mt-5 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4 text-base font-semibold leading-7 text-[#C2410C]">
                          {step.tip}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {steps.length === 0 ? (
                <div className="ui-empty">Esta receta aun no tiene pasos publicados.</div>
              ) : null}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
