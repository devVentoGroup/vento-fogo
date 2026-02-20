import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  RecipeIngredientsEditor,
  type IngredientLine,
} from "@/features/recipes/recipe-ingredients-editor";
import {
  RecipeStepsEditor,
  type RecipeStepLine,
} from "@/features/recipes/recipe-steps-editor";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  cost: number | null;
  product_type: string | null;
  is_active: boolean | null;
};

type SiteOption = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type RecipeCardRow = {
  id: string;
  product_id: string;
  site_id: string | null;
  yield_qty: number;
  yield_unit: string;
  portion_size: number | null;
  portion_unit: string | null;
  prep_time_minutes: number | null;
  shelf_life_days: number | null;
  difficulty: string | null;
  recipe_description: string | null;
  status: "draft" | "published" | "archived";
  is_active: boolean;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableNumber(value: FormDataEntryValue | null): number | null {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function asPositive(value: FormDataEntryValue | null, fallback: number) {
  const parsed = asNullableNumber(value);
  return parsed != null && parsed > 0 ? parsed : fallback;
}

function withQuery(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function baseNewPath(siteId: string, productId: string, source: string) {
  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  if (productId) qs.set("product_id", productId);
  if (source) qs.set("source", source);
  const query = qs.toString();
  return query ? `/recipes/new?${query}` : "/recipes/new";
}

async function saveRecipe(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const source = asText(formData.get("source"));
  const productId = asText(formData.get("product_id"));
  const returnBase = baseNewPath(siteId, productId, source);

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: returnBase,
    permissionCode: "production.recipes",
  });

  if (!productId) {
    redirect(withQuery(returnBase, "error", "Selecciona un producto para guardar la receta."));
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,name,sku,unit,product_type,is_active")
    .eq("id", productId)
    .maybeSingle();
  const productRow = (product as ProductOption | null) ?? null;

  if (!productRow || !productRow.is_active) {
    redirect(withQuery(returnBase, "error", "El producto seleccionado no esta activo."));
  }

  const productType = String(productRow.product_type ?? "").trim().toLowerCase();
  if (!["preparacion", "venta"].includes(productType)) {
    redirect(withQuery(returnBase, "error", "Solo se permiten productos tipo preparacion o venta."));
  }

  const recipePayload: Record<string, unknown> = {
    product_id: productId,
    yield_qty: asPositive(formData.get("yield_qty"), 1),
    yield_unit: asText(formData.get("yield_unit")) || productRow.unit || "un",
    portion_size: asNullableNumber(formData.get("portion_size")),
    portion_unit: asText(formData.get("portion_unit")) || null,
    prep_time_minutes: asNullableNumber(formData.get("prep_time_minutes")),
    shelf_life_days: asNullableNumber(formData.get("shelf_life_days")),
    difficulty: asText(formData.get("difficulty")) || null,
    recipe_description: asText(formData.get("recipe_description")) || null,
    status: (asText(formData.get("status")) || "draft").toLowerCase(),
    is_active: asText(formData.get("is_active")) === "1",
  };
  if (siteId) recipePayload.site_id = siteId;

  const { data: existingCard } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  let recipeCardId = String(existingCard?.id ?? "");
  if (!recipeCardId) {
    const { data: inserted, error: insertErr } = await supabase
      .from("recipe_cards")
      .insert(recipePayload)
      .select("id")
      .single();
    if (insertErr || !inserted?.id) {
      redirect(withQuery(returnBase, "error", insertErr?.message || "No se pudo crear la receta."));
    }
    recipeCardId = String(inserted.id);
  } else {
    const { error: updateErr } = await supabase
      .from("recipe_cards")
      .update(recipePayload)
      .eq("id", recipeCardId);
    if (updateErr) {
      redirect(withQuery(returnBase, "error", updateErr.message));
    }
  }

  const ingredientRaw = asText(formData.get("ingredient_lines"));
  let ingredientLines: IngredientLine[] = [];
  if (ingredientRaw) {
    try {
      ingredientLines = JSON.parse(ingredientRaw) as IngredientLine[];
    } catch {
      redirect(withQuery(returnBase, "error", "Formato invalido en ingredientes."));
    }
  }

  const normalizedIngredients = ingredientLines
    .filter((line) => !line._delete)
    .map((line) => ({
      ingredient_product_id: String(line.ingredient_product_id || "").trim(),
      quantity: Number(line.quantity ?? 0),
    }))
    .filter((line) => line.ingredient_product_id && Number.isFinite(line.quantity) && line.quantity > 0);

  const { error: deleteIngredientsErr } = await supabase
    .from("recipes")
    .delete()
    .eq("product_id", productId);
  if (deleteIngredientsErr) {
    redirect(withQuery(returnBase, "error", deleteIngredientsErr.message));
  }

  if (normalizedIngredients.length > 0) {
    const { error: insertIngredientsErr } = await supabase.from("recipes").insert(
      normalizedIngredients.map((line) => ({
        product_id: productId,
        ingredient_product_id: line.ingredient_product_id,
        quantity: line.quantity,
        is_active: true,
      }))
    );
    if (insertIngredientsErr) {
      redirect(withQuery(returnBase, "error", insertIngredientsErr.message));
    }
  }

  const stepsRaw = asText(formData.get("recipe_steps"));
  let steps: RecipeStepLine[] = [];
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw) as RecipeStepLine[];
    } catch {
      redirect(withQuery(returnBase, "error", "Formato invalido en pasos."));
    }
  }

  const normalizedSteps = steps
    .filter((step) => !step._delete)
    .map((step) => ({
      description: String(step.description ?? "").trim(),
      tip: String(step.tip ?? "").trim() || null,
      time_minutes:
        Number.isFinite(Number(step.time_minutes)) && Number(step.time_minutes) >= 0
          ? Number(step.time_minutes)
          : null,
      image_path: String(step.step_image_url ?? "").trim() || null,
      original_order:
        Number.isFinite(Number(step.step_number)) && Number(step.step_number) > 0
          ? Number(step.step_number)
          : 9999,
    }))
    .filter((step) => step.description.length > 0)
    .sort((a, b) => a.original_order - b.original_order)
    .map((step, index) => ({
      recipe_card_id: recipeCardId,
      step_number: index + 1,
      description: step.description,
      tip: step.tip,
      time_minutes: step.time_minutes,
      image_path: step.image_path,
    }));

  const { error: deleteStepsErr } = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_card_id", recipeCardId);
  if (deleteStepsErr) {
    redirect(withQuery(returnBase, "error", deleteStepsErr.message));
  }

  if (normalizedSteps.length > 0) {
    const { error: insertStepsErr } = await supabase
      .from("recipe_steps")
      .insert(normalizedSteps);
    if (insertStepsErr) {
      redirect(withQuery(returnBase, "error", insertStepsErr.message));
    }
  }

  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  qs.set("product_id", productId);
  qs.set("saved", "1");
  if (source) qs.set("source", source);
  redirect(`/recipes?${qs.toString()}`);
}

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    product_id?: string;
    source?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedProductId = String(sp.product_id ?? "").trim();
  const source = String(sp.source ?? "").trim().toLowerCase();
  const error = String(sp.error ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: baseNewPath(requestedSiteId, requestedProductId, source),
    permissionCode: "production.recipes",
  });

  const [{ data: employeeSitesRows }, { data: employeeRow }] = await Promise.all([
    supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(50),
    supabase
      .from("employees")
      .select("site_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const employeeSiteIds = ((employeeSitesRows ?? []) as Array<{ site_id: string | null }>)
    .map((row) => row.site_id)
    .filter((value): value is string => Boolean(value));

  const { data: sitesData } = employeeSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", employeeSiteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteOption[] };

  const sites = (sitesData ?? []) as SiteOption[];
  const resolvedSiteId =
    requestedSiteId ||
    employeeSiteIds[0] ||
    String(employeeRow?.site_id ?? "").trim();

  const [{ data: recipeCardsData }, { data: productRows }, { data: ingredientRows }] =
    await Promise.all([
      supabase
        .from("recipe_cards")
        .select(
          "id,product_id,site_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,status,is_active"
        )
        .order("updated_at", { ascending: false })
        .limit(600),
      supabase
        .from("products")
        .select("id,name,sku,unit,cost,product_type,is_active")
        .in("product_type", ["preparacion", "venta"])
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(800),
      supabase
        .from("products")
        .select("id,name,sku,unit,cost,product_type,is_active")
        .in("product_type", ["insumo", "preparacion"])
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1200),
    ]);

  const recipeCards = (recipeCardsData ?? []) as RecipeCardRow[];
  const products = (productRows ?? []) as ProductOption[];
  const ingredientOptions = (ingredientRows ?? []) as ProductOption[];

  const selectedProductId =
    requestedProductId ||
    (products.length ? products[0].id : "");
  const selectedProduct = products.find((row) => row.id === selectedProductId) ?? null;

  const selectedRecipeCard =
    recipeCards.find((row) => row.product_id === selectedProductId) ?? null;

  const [{ data: existingIngredientRows }, { data: existingStepsRows }] = await Promise.all([
    selectedProductId
      ? supabase
          .from("recipes")
          .select("id,ingredient_product_id,quantity")
          .eq("product_id", selectedProductId)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as Array<{ id: string; ingredient_product_id: string; quantity: number }> }),
    selectedRecipeCard?.id
      ? supabase
          .from("recipe_steps")
          .select("id,step_number,description,tip,time_minutes,image_path")
          .eq("recipe_card_id", selectedRecipeCard.id)
          .order("step_number", { ascending: true })
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            step_number: number;
            description: string;
            tip: string | null;
            time_minutes: number | null;
            image_path: string | null;
          }>,
        }),
  ]);

  const initialIngredientLines: IngredientLine[] = (
    (existingIngredientRows ?? []) as Array<{
      id: string;
      ingredient_product_id: string;
      quantity: number;
    }>
  ).map((row) => ({
    id: row.id,
    ingredient_product_id: row.ingredient_product_id,
    quantity: Number(row.quantity),
  }));

  const initialSteps: RecipeStepLine[] = (
    (existingStepsRows ?? []) as Array<{
      id: string;
      step_number: number;
      description: string;
      tip: string | null;
      time_minutes: number | null;
      image_path: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    step_number: Number(row.step_number),
    description: row.description ?? "",
    tip: row.tip ?? "",
    time_minutes: row.time_minutes ?? undefined,
    step_image_url: row.image_path ?? "",
  }));

  const defaultYieldUnit = selectedRecipeCard?.yield_unit || selectedProduct?.unit || "un";

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">{selectedRecipeCard ? "Editar receta" : "Nueva receta"}</h1>
        <p className="mt-2 ui-body-muted">
          Define ficha de receta, ingredientes (BOM) y pasos operativos en un solo flujo.
        </p>
        {source === "nexo" ? (
          <div className="mt-3 ui-alert ui-alert--neutral">
            Llegaste desde NEXO. Termina la receta aqui y quedara disponible para produccion en FOGO.
          </div>
        ) : null}
        {error ? <div className="mt-3 ui-alert ui-alert--warn">{error}</div> : null}
      </section>

      <form action={saveRecipe} className="space-y-6">
        <section className="ui-panel space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="source" value={source || "fogo"} />

            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede de receta</span>
              <select name="site_id" defaultValue={selectedRecipeCard?.site_id ?? resolvedSiteId} className="ui-input">
                <option value="">Sin sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Producto</span>
              <select
                name="product_id"
                defaultValue={selectedProductId}
                className="ui-input"
                required
              >
                <option value="">Selecciona un producto</option>
                {products.map((product) => {
                  const hasRecipe = recipeCards.some((card) => card.product_id === product.id);
                  return (
                    <option key={product.id} value={product.id}>
                      {product.name ?? "Producto"} ({product.sku ?? "-"}) - {product.product_type ?? "n/a"}
                      {hasRecipe ? " - con receta" : ""}
                    </option>
                  );
                })}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Si eliges un producto con receta existente, este formulario actualiza la receta actual.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select name="status" defaultValue={selectedRecipeCard?.status ?? "draft"} className="ui-input">
                <option value="draft">Borrador</option>
                <option value="published">Publicada</option>
                <option value="archived">Archivada</option>
              </select>
            </label>

            <label className="flex items-center gap-2 pt-8">
              <input
                type="checkbox"
                name="is_active"
                value="1"
                defaultChecked={selectedRecipeCard?.is_active ?? true}
              />
              <span className="ui-label">Receta activa</span>
            </label>
          </div>
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Ficha base</h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Rendimiento (cantidad)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="yield_qty"
                defaultValue={selectedRecipeCard?.yield_qty ?? 1}
                className="ui-input"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad rendimiento</span>
              <input
                type="text"
                name="yield_unit"
                defaultValue={defaultYieldUnit}
                className="ui-input"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Tiempo prep. (min)</span>
              <input
                type="number"
                min="0"
                name="prep_time_minutes"
                defaultValue={selectedRecipeCard?.prep_time_minutes ?? ""}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Porcion (tamano)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="portion_size"
                defaultValue={selectedRecipeCard?.portion_size ?? ""}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad porcion</span>
              <input
                type="text"
                name="portion_unit"
                defaultValue={selectedRecipeCard?.portion_unit ?? ""}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Vida util (dias)</span>
              <input
                type="number"
                min="0"
                name="shelf_life_days"
                defaultValue={selectedRecipeCard?.shelf_life_days ?? ""}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Dificultad</span>
              <select
                name="difficulty"
                defaultValue={selectedRecipeCard?.difficulty ?? ""}
                className="ui-input"
              >
                <option value="">Sin definir</option>
                <option value="facil">Facil</option>
                <option value="medio">Medio</option>
                <option value="dificil">Dificil</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Descripcion de receta</span>
            <textarea
              name="recipe_description"
              rows={3}
              defaultValue={selectedRecipeCard?.recipe_description ?? ""}
              className="ui-input min-h-0 py-2"
              placeholder="Resumen de tecnica, mise en place y notas clave..."
            />
          </label>
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Ingredientes (BOM)</h2>
          <RecipeIngredientsEditor
            initialRows={initialIngredientLines}
            products={ingredientOptions}
          />
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Pasos de preparacion</h2>
          <RecipeStepsEditor initialRows={initialSteps} />
        </section>

        <section className="ui-mobile-sticky-footer">
          <div className="ui-panel flex flex-wrap items-center justify-end gap-2">
            <a
              href={resolvedSiteId ? `/recipes?site_id=${encodeURIComponent(resolvedSiteId)}` : "/recipes"}
              className="ui-btn ui-btn--ghost"
            >
              Cancelar
            </a>
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar receta
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}

