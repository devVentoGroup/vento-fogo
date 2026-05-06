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
  return (
    recipe.cover_image_path ||
    product?.catalog_image_url ||
    product?.image_url ||
    ""
  );
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Sin dificultad";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
  return value;
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

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipe-book",
    permissionCode: "production.recipe_book.view",
  });

  const [{ data: currentSite }, { data: currentArea }] = await Promise.all([
    supabase.rpc("current_employee_site_id"),
    supabase.rpc("current_employee_area_id"),
  ]);

  const siteId = requestedSiteId || String(currentSite ?? "");

  const { data: areasData } = siteId
    ? await supabase
        .from("areas")
        .select("id,name,kind,site_id")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("name", { ascending: true })
    : { data: [] as AreaShape[] };

  const areas = (areasData ?? []) as AreaShape[];
  const selectedAreaId =
    (requestedAreaId && areas.some((area) => area.id === requestedAreaId) ? requestedAreaId : "") ||
    (areas.some((area) => area.id === String(currentArea ?? "")) ? String(currentArea ?? "") : "") ||
    areas[0]?.id ||
    "";

  const canCreateBatch = await checkPermission(supabase, APP_ID, "production.batches.create", {
    siteId,
    areaId: selectedAreaId || null,
  });

  let recipeQuery = supabase
    .from("recipe_cards")
    .select(
      "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,status,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,name,kind)"
    )
    .eq("is_active", true)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(120);

  if (siteId) recipeQuery = recipeQuery.eq("site_id", siteId);
  if (selectedAreaId) recipeQuery = recipeQuery.eq("area_id", selectedAreaId);

  const { data: recipesData } = await recipeQuery;
  const recipes = (recipesData ?? []) as RecipeCardRow[];
  const selectedRecipe =
    recipes.find((recipe) => recipe.id === requestedRecipeId) ??
    recipes[0] ??
    null;
  const selectedProduct = one(selectedRecipe?.products);
  const selectedArea = one(selectedRecipe?.areas) ?? areas.find((area) => area.id === selectedAreaId) ?? null;
  const productionQty =
    Number.isFinite(requestedQty) && requestedQty > 0
      ? requestedQty
      : Number(selectedRecipe?.yield_qty ?? 0) || 1;
  const scaleFactor =
    selectedRecipe && Number(selectedRecipe.yield_qty) > 0
      ? productionQty / Number(selectedRecipe.yield_qty)
      : 1;

  const [{ data: ingredientRows }, { data: stepRows }] = selectedRecipe
    ? await Promise.all([
        supabase
          .from("recipes")
          .select("ingredient_product_id,quantity,products(id,name,sku,unit,stock_unit_code,cost,image_url,catalog_image_url)")
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

  const areaParams = new URLSearchParams();
  if (siteId) areaParams.set("site_id", siteId);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-2)]">
        <div
          className="min-h-[280px] bg-[var(--ui-primary)] bg-cover bg-center"
          style={heroImage ? { backgroundImage: `linear-gradient(90deg, rgba(17,24,39,.92), rgba(17,24,39,.56), rgba(17,24,39,.18)), url("${heroImage}")` } : undefined}
        >
          <div className="flex min-h-[280px] max-w-5xl flex-col justify-end p-6 text-white md:p-8">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="ui-chip border-white/20 bg-white/15 text-white">{selectedArea?.name ?? "Area"}</span>
              <span className="ui-chip border-white/20 bg-white/15 text-white">{difficultyLabel(selectedRecipe?.difficulty)}</span>
              {selectedRecipe?.prep_time_minutes ? (
                <span className="ui-chip border-white/20 bg-white/15 text-white">{fmt(selectedRecipe.prep_time_minutes, 0)} min</span>
              ) : null}
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              {selectedProduct?.name ?? "Recetario"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-white/82">
              {selectedRecipe?.recipe_description || "Selecciona una receta publicada para ver ingredientes, pasos y produccion sugerida."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="ui-panel space-y-3">
            <h2 className="ui-h2">Area</h2>
            <div className="grid gap-2">
              {areas.map((area) => {
                const params = new URLSearchParams(areaParams);
                params.set("area_id", area.id);
                return (
                  <Link
                    key={area.id}
                    href={`/recipe-book?${params.toString()}`}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      area.id === selectedAreaId
                        ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)] text-[var(--ui-brand-700)]"
                        : "border-[var(--ui-border)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                    }`}
                  >
                    {area.name ?? area.kind ?? "Area"}
                  </Link>
                );
              })}
              {areas.length === 0 ? <div className="ui-empty">No hay areas disponibles para tu usuario.</div> : null}
            </div>
          </div>

          <div className="ui-panel space-y-3">
            <h2 className="ui-h2">Recetas</h2>
            <div className="space-y-2">
              {recipes.map((recipe) => {
                const product = one(recipe.products);
                const params = new URLSearchParams();
                if (siteId) params.set("site_id", siteId);
                if (selectedAreaId) params.set("area_id", selectedAreaId);
                params.set("recipe_id", recipe.id);
                if (productionQty) params.set("qty", String(productionQty));
                return (
                  <Link
                    key={recipe.id}
                    href={`/recipe-book?${params.toString()}`}
                    className={`block rounded-lg border p-3 transition ${
                      recipe.id === selectedRecipe?.id
                        ? "border-[var(--ui-brand)] bg-[var(--ui-brand-soft)]"
                        : "border-[var(--ui-border)] hover:bg-[var(--ui-surface-2)]"
                    }`}
                  >
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{product?.name ?? "Producto"}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      {fmt(recipe.yield_qty)} {recipe.yield_unit} por receta
                    </div>
                  </Link>
                );
              })}
              {recipes.length === 0 ? <div className="ui-empty">No hay recetas publicadas para esta area.</div> : null}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="ui-panel">
            <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
              <div>
                <h2 className="ui-h2">Produccion</h2>
                <p className="mt-1 ui-body-muted">
                  Ajusta la cantidad a preparar y FOGO escala los ingredientes desde el rendimiento base.
                </p>
              </div>
              <form className="grid gap-2">
                {siteId ? <input type="hidden" name="site_id" value={siteId} /> : null}
                {selectedAreaId ? <input type="hidden" name="area_id" value={selectedAreaId} /> : null}
                {selectedRecipe ? <input type="hidden" name="recipe_id" value={selectedRecipe.id} /> : null}
                <label>
                  <span className="ui-label">Cantidad a producir ({selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "un"})</span>
                  <input className="ui-input" type="number" min="0.01" step="0.01" name="qty" defaultValue={productionQty} />
                </label>
                <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm">Calcular</button>
              </form>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="ui-panel-soft">
                <div className="ui-label">Rendimiento base</div>
                <div className="mt-1 ui-h3">{fmt(selectedRecipe?.yield_qty)} {selectedRecipe?.yield_unit ?? "-"}</div>
              </div>
              <div className="ui-panel-soft">
                <div className="ui-label">Produccion objetivo</div>
                <div className="mt-1 ui-h3">{fmt(productionQty)} {selectedRecipe?.yield_unit ?? "-"}</div>
              </div>
              <div className="ui-panel-soft">
                <div className="ui-label">Factor</div>
                <div className="mt-1 ui-h3">{fmt(scaleFactor, 3)}x</div>
              </div>
              <div className="ui-panel-soft">
                <div className="ui-label">Costo estimado</div>
                <div className="mt-1 ui-h3">{money(totalCost)}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {canCreateBatch && selectedRecipe ? (
                <button type="button" className="ui-btn ui-btn--brand" disabled>
                  Preparar produccion
                </button>
              ) : (
                <span className="ui-chip">Sin permiso para crear lotes</span>
              )}
            </div>
          </section>

          <section className="ui-panel">
            <h2 className="ui-h2">Ingredientes escalados</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ingredients.map((row) => {
                const product = one(row.products);
                const requiredQty = Number(row.quantity ?? 0) * scaleFactor;
                const unit = product?.stock_unit_code || product?.unit || "-";
                return (
                  <div key={row.ingredient_product_id} className="rounded-lg border border-[var(--ui-border)] p-4">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{product?.name ?? "Ingrediente"}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "-"}</div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <span className="text-2xl font-semibold text-[var(--ui-text)]">{fmt(requiredQty, 3)}</span>
                      <span className="ui-chip">{unit}</span>
                    </div>
                  </div>
                );
              })}
              {ingredients.length === 0 ? <div className="ui-empty md:col-span-2">Esta receta no tiene ingredientes publicados.</div> : null}
            </div>
          </section>

          <section className="ui-panel">
            <h2 className="ui-h2">Paso a paso</h2>
            <div className="mt-4 space-y-4">
              {steps.map((step) => (
                <article key={step.id} className="grid gap-4 rounded-lg border border-[var(--ui-border)] p-4 md:grid-cols-[220px_1fr]">
                  <div
                    className="min-h-[160px] rounded-lg bg-[var(--ui-surface-2)] bg-cover bg-center"
                    style={step.image_path ? { backgroundImage: `url("${step.image_path}")` } : undefined}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ui-chip ui-chip--brand">Paso {step.step_number}</span>
                      {step.time_minutes != null ? <span className="ui-chip">{fmt(step.time_minutes, 0)} min</span> : null}
                    </div>
                    <p className="mt-3 text-base leading-7 text-[var(--ui-text)]">{step.description}</p>
                    {step.tip ? <p className="mt-3 text-sm font-semibold text-[var(--ui-brand-700)]">{step.tip}</p> : null}
                  </div>
                </article>
              ))}
              {steps.length === 0 ? <div className="ui-empty">Esta receta no tiene pasos publicados.</div> : null}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
