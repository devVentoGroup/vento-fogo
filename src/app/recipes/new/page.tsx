import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { RecipeBaseFields } from "@/features/recipes/recipe-base-fields";
import {
  RecipeIngredientsEditor,
  type IngredientLine,
} from "@/features/recipes/recipe-ingredients-editor";
import {
  RecipeStepsEditor,
  type RecipeStepLine,
} from "@/features/recipes/recipe-steps-editor";
import { RecipeContextSelectors } from "@/features/recipes/recipe-context-selectors";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") || "https://nexo.ventogroup.co";

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  cost: number | null;
  product_type: string | null;
  is_active: boolean | null;
};

type SiteOption = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaOption = {
  id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
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
  process_config: Record<string, unknown> | null;
  status: "draft" | "published" | "archived";
  is_active: boolean;
};

type UnitOption = {
  code: string;
  name: string | null;
  family: string | null;
  factor_to_base: number | null;
  is_active: boolean;
};

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

function normalizeUnitCode(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSlug(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isStandalonePanaderiaArea(area: AreaOption) {
  const code = String(area.code ?? "").trim().toUpperCase();
  const slug = normalizeSlug(area.name);
  return code === "PAN" || code === "PANADERIA" || slug === "panaderia";
}

function isProductionRecipeArea(area: AreaOption, allowedKinds: Set<string>) {
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

function sortProductionAreas(a: AreaOption, b: AreaOption) {
  const areaOrder = (area: AreaOption) => {
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

function parseJsonObject(value: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function withQuery(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function baseNewPath(siteId: string, areaId: string, productId: string, source: string) {
  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  if (areaId) qs.set("area_id", areaId);
  if (productId) qs.set("product_id", productId);
  if (source) qs.set("source", source);
  const query = qs.toString();
  return query ? `/recipes/new?${query}` : "/recipes/new";
}

async function saveRecipe(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const areaId = asText(formData.get("area_id"));
  const source = asText(formData.get("source"));
  const productId = asText(formData.get("product_id"));
  const returnBase = baseNewPath(siteId, areaId, productId, source);

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: returnBase,
    permissionCode: "production.recipes.manage",
  });

  if (!productId) {
    redirect(withQuery(returnBase, "error", "Selecciona un producto para guardar la receta."));
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
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

  const stepsRaw = asText(formData.get("recipe_steps"));
  let steps: RecipeStepLine[] = [];
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw) as RecipeStepLine[];
    } catch {
      redirect(withQuery(returnBase, "error", "Formato invalido en pasos."));
    }
  }

  const normalizedStepDraft = steps
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
    .sort((a, b) => a.original_order - b.original_order);

  const statusRaw = (asText(formData.get("status")) || "draft").toLowerCase();
  const status: "draft" | "published" | "archived" =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";
  const yieldQty = asPositive(formData.get("yield_qty"), 1);
  const yieldUnit = asText(formData.get("yield_unit")) || productRow.unit || "un";
  const portionSize = asNullableNumber(formData.get("portion_size"));
  const portionUnit = asText(formData.get("portion_unit")) || null;

  if (status === "published") {
    if (!siteId || !areaId) {
      redirect(withQuery(returnBase, "error", "Para publicar debes seleccionar sede y area productiva."));
    }
    if (!yieldQty || yieldQty <= 0 || !yieldUnit) {
      redirect(withQuery(returnBase, "error", "Para publicar debes completar rendimiento y unidad."));
    }
    if (!portionSize || portionSize <= 0 || !portionUnit) {
      redirect(withQuery(returnBase, "error", "Para publicar debes completar porcion y unidad de porcion."));
    }
    if (normalizedIngredients.length <= 0) {
      redirect(withQuery(returnBase, "error", "Para publicar debes tener al menos 1 ingrediente activo en BOM."));
    }
    if (normalizedStepDraft.length <= 0) {
      redirect(withQuery(returnBase, "error", "Para publicar debes tener al menos 1 paso de preparacion."));
    }
  }

  if (areaId) {
    const { data: validAreas } = siteId
      ? await supabase.rpc("fogo_recipe_area_options", { p_site_id: siteId })
      : { data: [] as AreaOption[] };
    const area = ((validAreas ?? []) as AreaOption[]).find((option) => option.id === areaId) ?? null;
    if (!area) {
      redirect(withQuery(returnBase, "error", "Selecciona un area productiva valida para el recetario."));
    }
  }

  const recipePayload: Record<string, unknown> = {
    product_id: productId,
    yield_qty: yieldQty,
    yield_unit: yieldUnit,
    portion_size: portionSize,
    portion_unit: portionUnit,
    prep_time_minutes: asNullableNumber(formData.get("prep_time_minutes")),
    shelf_life_days: asNullableNumber(formData.get("shelf_life_days")),
    difficulty: asText(formData.get("difficulty")) || null,
    recipe_description: asText(formData.get("recipe_description")) || null,
    process_config: parseJsonObject(asText(formData.get("process_config"))) ?? {},
    status,
    is_active: asText(formData.get("is_active")) === "1",
  };
  if (siteId) recipePayload.site_id = siteId;
  recipePayload.area_id = areaId || null;

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

  // Auto-costo receta: suma ingredientes / rendimiento expresado en unidad base del producto.
  // Aplica aunque el modo en NEXO sea manual para preparaciones/venta.
  if (normalizedIngredients.length > 0) {
    const ingredientIds = Array.from(
      new Set(normalizedIngredients.map((line) => line.ingredient_product_id))
    );
    const { data: ingredientProducts } = await supabase
      .from("products")
      .select("id,cost")
      .in("id", ingredientIds);

    const ingredientCostMap = new Map<string, number>();
    for (const row of (ingredientProducts ?? []) as Array<{ id: string; cost: number | null }>) {
      ingredientCostMap.set(row.id, Number(row.cost ?? 0));
    }

    const totalIngredientCost = normalizedIngredients.reduce((acc, line) => {
      const unitCost = ingredientCostMap.get(line.ingredient_product_id) ?? 0;
      return acc + unitCost * Number(line.quantity);
    }, 0);

    const yieldQtyRaw = Number(recipePayload.yield_qty ?? 0);
    const yieldUnitCode = normalizeUnitCode(String(recipePayload.yield_unit ?? ""));
    const stockUnitCode = normalizeUnitCode(
      String(productRow.stock_unit_code ?? productRow.unit ?? "")
    );

    let yieldQtyInStockUnit = yieldQtyRaw;
    if (
      yieldQtyRaw > 0 &&
      yieldUnitCode &&
      stockUnitCode &&
      yieldUnitCode !== stockUnitCode
    ) {
      const { data: unitsData } = await supabase
        .from("inventory_units")
        .select("code,family,factor_to_base")
        .in("code", [yieldUnitCode, stockUnitCode]);
      const unitMap = new Map(
        ((unitsData ?? []) as Array<{ code: string; family: string | null; factor_to_base: number | null }>).map(
          (row) => [normalizeUnitCode(row.code), row]
        )
      );
      const fromUnit = unitMap.get(yieldUnitCode);
      const toUnit = unitMap.get(stockUnitCode);
      if (
        fromUnit &&
        toUnit &&
        fromUnit.family &&
        toUnit.family &&
        fromUnit.family === toUnit.family &&
        Number(fromUnit.factor_to_base) > 0 &&
        Number(toUnit.factor_to_base) > 0
      ) {
        yieldQtyInStockUnit =
          yieldQtyRaw *
          (Number(fromUnit.factor_to_base) / Number(toUnit.factor_to_base));
      }
    }

    if (yieldQtyInStockUnit > 0 && Number.isFinite(totalIngredientCost) && totalIngredientCost >= 0) {
      const recipeUnitCost = totalIngredientCost / yieldQtyInStockUnit;
      await supabase
        .from("products")
        .update({
          cost: Number(recipeUnitCost.toFixed(6)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);
    }
  }

  const normalizedSteps = normalizedStepDraft
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
  qs.set("saved", "1");
  if (source === "nexo") {
    qs.set("product_id", productId);
    qs.set("source", source);
  }
  redirect(`/recipes?${qs.toString()}`);
}

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    product_id?: string;
    source?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedAreaId = String(sp.area_id ?? "").trim();
  const requestedProductId = String(sp.product_id ?? "").trim();
  const source = String(sp.source ?? "").trim().toLowerCase();
  const error = String(sp.error ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: baseNewPath(requestedSiteId, requestedAreaId, requestedProductId, source),
    permissionCode: "production.recipes.manage",
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

  let recipeAreasData: AreaOption[] = [];
  if (resolvedSiteId) {
    const { data: rpcAreasData } = await supabase.rpc("fogo_recipe_area_options", {
      p_site_id: resolvedSiteId,
    });
    recipeAreasData = (rpcAreasData ?? []) as AreaOption[];
    if (recipeAreasData.length === 0) {
      const { data: fallbackAreasData } = await supabase
        .from("areas")
        .select("id,code,name,kind")
        .eq("site_id", resolvedSiteId)
        .eq("is_active", true);
      recipeAreasData = (fallbackAreasData ?? []) as AreaOption[];
    }
  }
  const allowedAreaKinds = new Set(PRODUCTION_RECIPE_AREA_KINDS);
  const areas = recipeAreasData
    .filter((area) => isProductionRecipeArea(area, allowedAreaKinds))
    .sort(sortProductionAreas);

  const [
    { data: recipeCardsData },
    { data: productRows },
    { data: ingredientRows },
    { data: unitsData },
  ] =
    await Promise.all([
      supabase
        .from("recipe_cards")
        .select(
          "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,process_config,status,is_active"
        )
        .order("updated_at", { ascending: false })
        .limit(600),
      supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code,cost,product_type,is_active")
        .in("product_type", ["preparacion", "venta"])
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(800),
      supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code,cost,product_type,is_active")
        .in("product_type", ["insumo", "preparacion"])
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1200),
      supabase
        .from("inventory_units")
        .select("code,name,family,factor_to_base,is_active")
        .eq("is_active", true)
        .order("family", { ascending: true })
        .order("factor_to_base", { ascending: true }),
    ]);

  const recipeCards = (recipeCardsData ?? []) as RecipeCardRow[];
  const products = (productRows ?? []) as ProductOption[];
  const ingredientOptions = (ingredientRows ?? []) as ProductOption[];
  const units = (unitsData ?? []) as UnitOption[];

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
  const formSiteId = requestedSiteId || selectedRecipeCard?.site_id || resolvedSiteId;
  const formAreaId =
    (requestedAreaId && areas.some((area) => area.id === requestedAreaId) ? requestedAreaId : "") ||
    (selectedRecipeCard?.area_id && areas.some((area) => area.id === selectedRecipeCard.area_id)
      ? selectedRecipeCard.area_id
      : "");

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
              <select name="site_id" defaultValue={formSiteId} className="ui-input">
                <option value="">Sin sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Cambia la sede desde la URL o recarga la ficha para actualizar areas.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Area de receta</span>
              <select name="area_id" defaultValue={formAreaId} className="ui-input" disabled={!formSiteId}>
                <option value="">Sin area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name ?? area.kind ?? area.id}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Areas cargadas para la sede seleccionada: {areas.length}.
              </span>
            </label>

            <RecipeContextSelectors
              initialSiteId={formSiteId}
              initialAreaId={formAreaId}
              initialProductId={selectedProductId}
              source={source || "fogo"}
              sites={sites.map((site) => ({ id: site.id, name: site.name }))}
              areas={areas.map((area) => ({ id: area.id, name: area.name, kind: area.kind }))}
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                sku: product.sku,
                product_type: product.product_type,
              }))}
              recipeCards={recipeCards.map((card) => ({ product_id: card.product_id }))}
            />

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select name="status" defaultValue={selectedRecipeCard?.status ?? "draft"} className="ui-input">
                <option value="draft">Borrador</option>
                <option value="published">Publicada</option>
                <option value="archived">Archivada</option>
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Para publicar: rendimiento + porcion completos, minimo 1 ingrediente y 1 paso.
              </span>
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

        <RecipeBaseFields
          key={`base-${selectedProductId}-${selectedRecipeCard?.id ?? "new"}`}
          initialYieldQty={selectedRecipeCard?.yield_qty ?? 1}
          initialYieldUnit={defaultYieldUnit}
          initialPortionSize={selectedRecipeCard?.portion_size ?? null}
          initialPortionUnit={selectedRecipeCard?.portion_unit ?? null}
          initialPrepTimeMinutes={selectedRecipeCard?.prep_time_minutes ?? null}
          initialShelfLifeDays={selectedRecipeCard?.shelf_life_days ?? null}
          initialDifficulty={selectedRecipeCard?.difficulty ?? null}
          initialDescription={selectedRecipeCard?.recipe_description ?? null}
          initialProcessConfig={selectedRecipeCard?.process_config ?? null}
          units={units}
          nexoCatalogUrl={
            selectedProductId
              ? `${NEXO_BASE_URL}/inventory/catalog/${encodeURIComponent(selectedProductId)}`
              : `${NEXO_BASE_URL}/inventory/catalog`
          }
        />

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Ingredientes (BOM)</h2>
          <RecipeIngredientsEditor
            key={`bom-${selectedProductId}-${selectedRecipeCard?.id ?? "new"}`}
            initialRows={initialIngredientLines}
            products={ingredientOptions}
          />
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Pasos de preparacion</h2>
          <RecipeStepsEditor
            key={`steps-${selectedProductId}-${selectedRecipeCard?.id ?? "new"}`}
            initialRows={initialSteps}
          />
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
