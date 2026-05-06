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

  const [{ data: areasData }, { data: recipeRowsData }] = await Promise.all([
    siteId
      ? supabase
          .from("areas")
          .select("id,name,kind,site_id")
          .eq("site_id", siteId)
          .eq("is_active", true)
          .order("name", { ascending: true })
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

  const areas = (areasData ?? []) as AreaShape[];
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
  const hasRecipes = allRecipes.length > 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[var(--ui-radius-card)] border border-[#FFD0A8] bg-white shadow-[var(--ui-shadow-2)]">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#F97316] via-[#EF4444] to-[#F59E0B]" />
        <div className="grid gap-0 lg:grid-cols-[1.1fr_360px]">
          <div className="p-6 md:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                Recetario FOGO
              </span>
              <span className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
                {areaLabel(selectedArea)}
              </span>
              <span className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
                {recipes.length} publicadas
              </span>
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[var(--ui-text)] md:text-6xl">
              {selectedProduct?.name ?? "Recetario por area"}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ui-muted)] md:text-lg">
              {selectedRecipe?.recipe_description ||
                "Consulta recetas publicadas por area, escala ingredientes y sigue el paso a paso visual para preparar con consistencia."}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Rendimiento</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                  {fmt(selectedRecipe?.yield_qty)} {selectedRecipe?.yield_unit ?? "-"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--ui-border)] bg-white p-4">
                <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Dificultad</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                  {difficultyLabel(selectedRecipe?.difficulty)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--ui-border)] bg-white p-4">
                <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Tiempo</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                  {selectedRecipe?.prep_time_minutes ? `${fmt(selectedRecipe.prep_time_minutes, 0)} min` : "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="relative min-h-[280px] bg-[#FFF7ED] p-5 lg:min-h-full">
            {heroImage ? (
              <div
                className="h-full min-h-[280px] rounded-lg bg-cover bg-center shadow-[var(--ui-shadow-1)]"
                style={{ backgroundImage: `url("${heroImage}")` }}
              />
            ) : (
              <div className="flex h-full min-h-[280px] flex-col justify-between rounded-lg border border-[#FED7AA] bg-[linear-gradient(135deg,#FFF7ED_0%,#FFFFFF_54%,#FFE4CC_100%)] p-6">
                <div className="text-sm font-semibold uppercase tracking-wide text-[#C2410C]">FOGO</div>
                <div>
                  <div className="text-6xl font-semibold text-[#F97316]">01</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--ui-muted)]">
                    Portadas y fotos de pasos apareceran aqui cuando gerencia complete el recetario visual.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {isManagement ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="ui-h2">Areas de produccion</h2>
            <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm">
              Admin recetas
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {areas.map((area) => {
              const count = recipeCountByArea.get(area.id) ?? 0;
              return (
                <Link
                  key={area.id}
                  href={recipeHref({ siteId, areaId: area.id })}
                  className={`min-w-[180px] rounded-lg border px-4 py-3 transition ${
                    area.id === selectedAreaId
                      ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]"
                      : "border-[var(--ui-border)] bg-white hover:border-[#FDBA74]"
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{areaLabel(area)}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">{count} recetas publicadas</div>
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

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="ui-h2">Recetas</h2>
            <span className="ui-chip ui-chip--brand">{recipes.length}</span>
          </div>

          <div className="grid gap-3">
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
                  className={`grid grid-cols-[74px_1fr] gap-3 rounded-lg border bg-white p-3 transition ${
                    active
                      ? "border-[#F97316] shadow-[var(--ui-shadow-1)]"
                      : "border-[var(--ui-border)] hover:border-[#FDBA74]"
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
        </aside>

        <main className="space-y-6">
          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr_300px] lg:items-end">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Produccion sugerida</div>
                <h2 className="mt-1 ui-h2">Escalar ingredientes</h2>
                <p className="mt-2 ui-body-muted">
                  Cambia la cantidad objetivo y FOGO recalcula cada ingrediente con el rendimiento publicado.
                </p>
              </div>
              <form className="grid gap-2 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-3">
                {siteId ? <input type="hidden" name="site_id" value={siteId} /> : null}
                {selectedAreaId ? <input type="hidden" name="area_id" value={selectedAreaId} /> : null}
                {selectedRecipe ? <input type="hidden" name="recipe_id" value={selectedRecipe.id} /> : null}
                <label>
                  <span className="ui-label">
                    Cantidad a producir ({selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "un"})
                  </span>
                  <input
                    className="ui-input mt-1 bg-white"
                    type="number"
                    min="0.01"
                    step="0.01"
                    name="qty"
                    defaultValue={productionQty}
                  />
                </label>
                <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                  Calcular
                </button>
              </form>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--ui-border)] p-4">
                <div className="ui-label">Base</div>
                <div className="mt-1 ui-h3">
                  {fmt(selectedRecipe?.yield_qty)} {selectedRecipe?.yield_unit ?? "-"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--ui-border)] p-4">
                <div className="ui-label">Objetivo</div>
                <div className="mt-1 ui-h3">
                  {fmt(productionQty)} {selectedRecipe?.yield_unit ?? "-"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--ui-border)] p-4">
                <div className="ui-label">Factor</div>
                <div className="mt-1 ui-h3">{fmt(scaleFactor, 3)}x</div>
              </div>
              <div className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
                <div className="ui-label">Costo estimado</div>
                <div className="mt-1 ui-h3">{money(totalCost)}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-4">
              <p className="max-w-xl text-sm text-[var(--ui-muted)]">
                La creacion real del lote queda pendiente del RPC transaccional de produccion para consumir inventario sin riesgo.
              </p>
              {canCreateBatch && selectedRecipe ? (
                <Link
                  href={`/production-batches/new?recipe_id=${encodeURIComponent(selectedRecipe.id)}&qty=${encodeURIComponent(String(productionQty))}`}
                  className="ui-btn ui-btn--brand"
                >
                  Preparar produccion
                </Link>
              ) : (
                <span className="ui-chip">Sin permiso para crear lotes</span>
              )}
            </div>
          </section>

          <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Mise en place</div>
                <h2 className="mt-1 ui-h2">Ingredientes escalados</h2>
              </div>
              <span className="ui-chip">{ingredients.length} lineas</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ingredients.map((row, index) => {
                const product = one(row.products);
                const requiredQty = Number(row.quantity ?? 0) * scaleFactor;
                const unit = product?.stock_unit_code || product?.unit || "-";
                return (
                  <div
                    key={row.ingredient_product_id}
                    className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border border-[var(--ui-border)] p-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF7ED] text-sm font-semibold text-[#C2410C]">
                      {index + 1}
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
                <h2 className="mt-1 ui-h2">Paso a paso</h2>
              </div>
              <span className="ui-chip">{steps.length} pasos</span>
            </div>
            <div className="mt-5 space-y-4">
              {steps.map((step) => (
                <article
                  key={step.id}
                  className="grid overflow-hidden rounded-lg border border-[var(--ui-border)] bg-white md:grid-cols-[260px_1fr]"
                >
                  <div
                    className="min-h-[190px] bg-[#FFF7ED] bg-cover bg-center"
                    style={step.image_path ? { backgroundImage: `url("${step.image_path}")` } : undefined}
                  >
                    {!step.image_path ? (
                      <div className="flex h-full min-h-[190px] items-center justify-center text-sm font-semibold text-[#C2410C]">
                        Foto pendiente
                      </div>
                    ) : null}
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#F97316] px-3 py-1 text-xs font-semibold text-white">
                        Paso {step.step_number}
                      </span>
                      {step.time_minutes != null ? (
                        <span className="ui-chip">{fmt(step.time_minutes, 0)} min</span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-base leading-7 text-[var(--ui-text)]">{step.description}</p>
                    {step.tip ? (
                      <p className="mt-4 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-3 text-sm font-semibold text-[#C2410C]">
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
