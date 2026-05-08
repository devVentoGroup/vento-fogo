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
  if (!normalized) return "Sin dificultad";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
  return value;
}

function areaLabel(area: AreaShape | null | undefined) {
  return area?.name || area?.kind || "Area";
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

  const [{ data: siteData }, { data: rpcAreasData }, { data: recipeRowsData }] = await Promise.all([
    siteId
      ? supabase.from("sites").select("id,site_type").eq("id", siteId).maybeSingle()
      : Promise.resolve({ data: null as { id: string; site_type: string | null } | null }),
    siteId
      ? supabase.rpc("fogo_recipe_area_options", { p_site_id: siteId })
      : Promise.resolve({ data: [] as AreaShape[] }),
    (() => {
      let query = supabase
        .from("recipe_cards")
        .select(
          "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,status,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,name,kind)"
        )
        .eq("is_active", true)
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(160);
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
  const allowedAreaKinds = new Set(
    String(siteData?.site_type ?? "") === "production_center" ? PRODUCTION_RECIPE_AREA_KINDS : []
  );
  const areas = recipeAreasData
    .filter((area) => isProductionRecipeArea(area, allowedAreaKinds))
    .sort(sortProductionAreas);
  const allRecipes = (recipeRowsData ?? []) as RecipeCardRow[];
  const recipeCountByArea = new Map<string, number>();
  for (const recipe of allRecipes) {
    const areaId = String(recipe.area_id ?? "");
    if (!areaId) continue;
    recipeCountByArea.set(areaId, (recipeCountByArea.get(areaId) ?? 0) + 1);
  }

  const currentAreaId = String(currentArea ?? "");
  const firstAreaWithRecipes =
    areas.find((area) => (recipeCountByArea.get(area.id) ?? 0) > 0)?.id ?? "";
  const selectedAreaId =
    isManagement
      ? (requestedAreaId && areas.some((area) => area.id === requestedAreaId) ? requestedAreaId : "") ||
        firstAreaWithRecipes ||
        areas[0]?.id ||
        ""
      : (currentAreaId && areas.some((area) => area.id === currentAreaId) ? currentAreaId : "");

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
    areaId: selectedAreaId || null,
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
  const heroImage = imageUrl(selectedRecipe);
  const firstStepImage = steps.find((step) => step.image_path)?.image_path ?? "";
  const coverImage = heroImage || firstStepImage;
  const hasRecipes = allRecipes.length > 0;
  const selectedAreaName = areaLabel(selectedArea);
  const baseYield = `${fmt(selectedRecipe?.yield_qty)} ${selectedRecipe?.yield_unit ?? "-"}`;
  const targetYield = `${fmt(productionQty)} ${selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "-"}`;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[var(--ui-radius-card)] border border-[#E5D6C5] bg-[#FFFDFC] shadow-[var(--ui-shadow-2)]">
        <div className="grid min-h-[420px] lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="relative flex min-h-[420px] flex-col justify-end overflow-hidden bg-[#1F2937] p-6 text-white md:p-8">
            {coverImage ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url("${coverImage}")` }}
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#1F2937_0%,#4B1F10_52%,#F59E0B_100%)]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.10)_0%,rgba(17,24,39,0.78)_100%)]" />
            <div className="relative max-w-4xl">
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                  Recetario FOGO
                </span>
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  {selectedAreaName}
                </span>
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                  {recipes.length} recetas
                </span>
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] text-white md:text-6xl">
                {selectedProduct?.name ?? "Recetario por area"}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/88 md:text-lg">
                {selectedRecipe?.recipe_description ||
                  "Recetas publicadas por area, con ingredientes escalados y guia visual para producir con consistencia."}
              </p>
            </div>
          </div>

          <aside className="flex flex-col justify-between border-t border-[#E5D6C5] bg-[#FFFDFC] p-6 lg:border-l lg:border-t-0 md:p-8">
            <div>
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Ficha rapida</div>
              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#E5D6C5] bg-[#E5D6C5]">
                <div className="bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Base</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{baseYield}</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Objetivo</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{targetYield}</div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Tiempo</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                    {selectedRecipe?.prep_time_minutes ? `${fmt(selectedRecipe.prep_time_minutes, 0)} min` : "-"}
                  </div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Dificultad</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
                    {difficultyLabel(selectedRecipe?.difficulty)}
                  </div>
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-3 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
              {siteId ? <input type="hidden" name="site_id" value={siteId} /> : null}
              {selectedAreaId ? <input type="hidden" name="area_id" value={selectedAreaId} /> : null}
              {selectedRecipe ? <input type="hidden" name="recipe_id" value={selectedRecipe.id} /> : null}
              <label>
                <span className="ui-label">
                  Cantidad a producir ({selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "un"})
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
                  Calcular
                </button>
                {canCreateBatch && selectedRecipe ? (
                  <Link
                    href={`/production-batches/new?recipe_id=${encodeURIComponent(selectedRecipe.id)}&qty=${encodeURIComponent(String(productionQty))}`}
                    className="ui-btn ui-btn--primary ui-btn--sm"
                  >
                    Producir
                  </Link>
                ) : (
                  <span className="ui-btn ui-btn--ghost ui-btn--sm pointer-events-none opacity-70">
                    Sin permiso
                  </span>
                )}
              </div>
            </form>
          </aside>
        </div>
      </section>

      {isManagement ? (
        <section className="space-y-3 rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="ui-h2">Areas de produccion</h2>
            <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm">
              Admin recetas
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {areas.map((area) => {
              const count = recipeCountByArea.get(area.id) ?? 0;
              return (
                <Link
                  key={area.id}
                  href={recipeHref({ siteId, areaId: area.id })}
                  className={`rounded-lg border px-4 py-3 transition ${
                    area.id === selectedAreaId
                      ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                      : "border-[var(--ui-border)] bg-[#FBFCFD] hover:border-[#FDBA74] hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{areaLabel(area)}</div>
                    <div className="text-2xl font-semibold text-[#C2410C]">{count}</div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5D6C5]">
                    <div
                      className="h-full rounded-full bg-[#F97316]"
                      style={{ width: `${Math.min(100, count * 18)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
            {areas.length === 0 ? (
              <div className="ui-empty w-full">No hay areas disponibles para tu usuario.</div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3">
          <div className="text-xs font-semibold uppercase text-[#C2410C]">Tu area</div>
          <div className="mt-1 text-base font-semibold text-[var(--ui-text)]">
            {areaLabel(selectedArea)}
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <div className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
            <div className="flex items-center justify-between">
              <h2 className="ui-h2">Indice</h2>
              <span className="ui-chip ui-chip--brand">{recipes.length}</span>
            </div>
            <div className="mt-4 grid gap-3">
            {recipes.map((recipe) => {
              const product = one(recipe.products);
              const thumb = imageUrl(recipe);
              const active = recipe.id === selectedRecipe?.id;
              return (
                <Link
                  key={recipe.id}
                  href={recipeHref({
                    siteId,
                    areaId: selectedAreaId,
                    recipeId: recipe.id,
                    qty: productionQty,
                  })}
                  className={`grid grid-cols-[74px_1fr] gap-3 rounded-lg border p-2.5 transition ${
                    active
                      ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                      : "border-[var(--ui-border)] bg-[#FBFCFD] hover:border-[#FDBA74] hover:bg-white"
                  }`}
                >
                  <div
                    className="h-[74px] rounded-md bg-[#FFF7ED] bg-cover bg-center"
                    style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--ui-text)]">
                      {product?.name ?? "Producto"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "-"}</div>
                    <div className="mt-2 text-xs font-semibold text-[#C2410C]">
                      {fmt(recipe.yield_qty)} {recipe.yield_unit} base
                    </div>
                  </div>
                </Link>
              );
            })}
            {!hasRecipes ? (
              <div className="ui-empty">No hay recetas publicadas para tu sede.</div>
            ) : recipes.length === 0 ? (
              <div className="ui-empty">Esta area no tiene recetas publicadas.</div>
            ) : null}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Mise en place</div>
                <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Ingredientes escalados</h2>
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
                    key={row.ingredient_product_id}
                    className="grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-lg border border-[var(--ui-border)] bg-[#FBFCFD] p-3"
                  >
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-md bg-[#FFF7ED] bg-cover bg-center text-sm font-semibold text-[#C2410C]"
                      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                    >
                      {!thumb ? index + 1 : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--ui-text)]">
                        {product?.name ?? "Ingrediente"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold text-[var(--ui-text)]">{fmt(requiredQty, 3)}</div>
                      <div className="text-xs font-semibold text-[#C2410C]">{unit}</div>
                    </div>
                  </div>
                );
              })}
              {ingredients.length === 0 ? (
                <div className="ui-empty md:col-span-2">Esta receta no tiene ingredientes publicados.</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Guia visual</div>
                <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Paso a paso</h2>
              </div>
              <span className="ui-chip">{steps.length} pasos</span>
            </div>
            <div className="mt-6 space-y-5">
              {steps.map((step) => (
                <article
                  key={step.id}
                  className="grid overflow-hidden rounded-lg border border-[#E5D6C5] bg-[#FFFDFC] shadow-[var(--ui-shadow-soft)] md:grid-cols-[320px_1fr]"
                >
                  <div
                    className="min-h-[240px] bg-[#FFF7ED] bg-cover bg-center"
                    style={step.image_path ? { backgroundImage: `url("${step.image_path}")` } : undefined}
                  >
                    {!step.image_path ? (
                      <div className="flex h-full min-h-[240px] items-center justify-center text-sm font-semibold text-[#C2410C]">
                        Foto pendiente
                      </div>
                    ) : null}
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F97316] text-base font-semibold text-white">
                        {step.step_number}
                      </span>
                      {step.time_minutes != null ? (
                        <span className="ui-chip">{fmt(step.time_minutes, 0)} min</span>
                      ) : null}
                    </div>
                    <p className="mt-5 text-lg leading-8 text-[var(--ui-text)]">{step.description}</p>
                    {step.tip ? (
                      <p className="mt-5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4 text-sm font-semibold leading-6 text-[#C2410C]">
                        {step.tip}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
              {steps.length === 0 ? (
                <div className="ui-empty">Esta receta no tiene pasos publicados.</div>
              ) : null}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
