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
import {
  RecipeOutputsEditor,
  type RecipeOutputLine,
} from "@/features/recipes/recipe-outputs-editor";
import { RecipeContextSelectors } from "@/features/recipes/recipe-context-selectors";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  cost: number | null;
  product_type: string | null;
  is_active: boolean | null;
  product_inventory_profiles?: { inventory_kind: string | null } | { inventory_kind: string | null }[] | null;
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

type RecipeDependencyRow = {
  product_id: string | null;
  ingredient_product_id: string | null;
};

type InventoryLocationOption = {
  id: string;
  site_id: string;
  area_id: string | null;
  code: string | null;
  zone: string | null;
  description: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

type ProductSiteSettingRow = {
  site_id: string;
  product_id: string;
  is_active: boolean;
  local_production_enabled: boolean | null;
  sales_enabled: boolean | null;
  inventory_enabled?: boolean | null;
  production_location_id: string | null;
};

type ProductSiteProductionRouteRow = {
  id: string;
  site_id: string;
  external_recipe_id: string | null;
  input_location_id: string | null;
  output_mode: string | null;
  output_location_id: string | null;
  is_default: boolean | null;
};

type RecipeSiteUseMode =
  | "produces_here"
  | "sells_finished_good"
  | "prepares_to_order"
  | "stored_for_production"
  | "no_inventory";

type RecipeSiteUseInput = {
  siteId: string;
  usageMode: RecipeSiteUseMode;
  areaId: string | null;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
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

function parseRecipeOutputs(raw: string): RecipeOutputLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecipeOutputLine[]) : [];
  } catch {
    return [];
  }
}

function normalizeUnitCode(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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

function productInventoryKind(product: ProductOption) {
  const profile = Array.isArray(product.product_inventory_profiles)
    ? product.product_inventory_profiles[0]
    : product.product_inventory_profiles;
  return String(profile?.inventory_kind ?? "").trim().toLowerCase();
}

function isRecipeIngredientOption(product: ProductOption) {
  const productType = String(product.product_type ?? "").trim().toLowerCase();
  const inventoryKind = productInventoryKind(product);

  if (inventoryKind === "asset") return false;
  if (productType === "preparacion") return true;
  if (productType !== "insumo") return false;
  return !inventoryKind || ["ingredient", "packaging", "unclassified"].includes(inventoryKind);
}

function isStandalonePanaderiaArea(area: AreaOption) {
  const code = String(area.code ?? "")
    .trim()
    .toUpperCase();
  const slug = normalizeSlug(area.name);
  return code === "PAN" || code === "PANADERIA" || slug === "panaderia";
}

function sortProductionAreas(a: AreaOption, b: AreaOption) {
  return String(a.name ?? a.code ?? "").localeCompare(
    String(b.name ?? b.code ?? ""),
    "es",
  );
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

function findRecipeCyclePath(
  targetProductId: string,
  ingredientProductIds: string[],
  dependencies: RecipeDependencyRow[],
): string[] | null {
  const target = targetProductId.trim();
  if (!target) return null;

  const graph = new Map<string, string[]>();
  for (const row of dependencies) {
    const productId = String(row.product_id ?? "").trim();
    const ingredientId = String(row.ingredient_product_id ?? "").trim();
    if (!productId || !ingredientId) continue;
    const edges = graph.get(productId) ?? [];
    edges.push(ingredientId);
    graph.set(productId, edges);
  }

  for (const ingredientId of ingredientProductIds) {
    const start = ingredientId.trim();
    if (!start) continue;
    if (start === target) return [target, start];

    const queue: Array<{ productId: string; path: string[] }> = [
      { productId: start, path: [target, start] },
    ];
    const visited = new Set<string>([target]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (visited.has(current.productId)) continue;
      visited.add(current.productId);

      for (const next of graph.get(current.productId) ?? []) {
        const path = [...current.path, next];
        if (next === target) return path;
        if (!visited.has(next)) queue.push({ productId: next, path });
      }
    }
  }

  return null;
}

function withQuery(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function baseNewPath(
  siteId: string,
  areaId: string,
  productId: string,
  source: string,
) {
  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  if (areaId) qs.set("area_id", areaId);
  if (productId) qs.set("product_id", productId);
  if (source) qs.set("source", source);
  const query = qs.toString();
  return query ? `/recipes/new?${query}` : "/recipes/new";
}

function recipeEditPath(
  recipeCardId: string,
  siteId: string,
  areaId: string,
  productId: string,
  source: string,
) {
  const recipeId = recipeCardId.trim();
  const qs = new URLSearchParams();
  if (siteId) qs.set("site_id", siteId);
  if (areaId) qs.set("area_id", areaId);
  if (productId) qs.set("product_id", productId);
  if (source) qs.set("source", source);
  const query = qs.toString();
  const base = recipeId ? `/recipes/${encodeURIComponent(recipeId)}/edit` : "/recipes";
  return query ? `${base}?${query}` : base;
}

function parseRecipeSiteUses(formData: FormData): RecipeSiteUseInput[] {
  const siteIds = Array.from(
    new Set(
      formData
        .getAll("site_use_site_id")
        .map((value) => asText(value))
        .filter(Boolean),
    ),
  );
  const validModes = new Set<string>([
    "produces_here",
    "sells_finished_good",
    "prepares_to_order",
    "stored_for_production",
    "no_inventory",
  ]);

  return siteIds.flatMap((siteId) => {
    if (asText(formData.get(`site_use_enabled_${siteId}`)) !== "1") return [];

    const rawMode = asText(formData.get(`site_use_mode_${siteId}`));
    const usageMode = validModes.has(rawMode) ? rawMode : "sells_finished_good";
    return [
      {
        siteId,
        usageMode: usageMode as RecipeSiteUseInput["usageMode"],
        areaId: asText(formData.get(`site_use_area_${siteId}`)) || null,
        sourceLocationId:
          asText(formData.get(`site_use_source_loc_${siteId}`)) || null,
        destinationLocationId:
          asText(formData.get(`site_use_destination_loc_${siteId}`)) || null,
      },
    ];
  });
}

function selectPrimaryRecipeUse(uses: RecipeSiteUseInput[]) {
  return (
    uses.find(
      (use) =>
        use.usageMode === "produces_here" ||
        use.usageMode === "prepares_to_order",
    ) ??
    uses[0] ??
    null
  );
}

function siteLabel(site: SiteOption | null | undefined) {
  return site?.name ?? "Sede";
}

function areaLabel(area: AreaOption | null | undefined) {
  return area?.name ?? area?.kind ?? "Area";
}

function locationLabel(location: InventoryLocationOption | null | undefined) {
  if (!location) return "LOC";
  const code = location.code ? `${location.code} - ` : "";
  return `${code}${location.zone ?? location.description ?? location.id}`;
}

function usageLabel(mode: string) {
  if (mode === "produces_here") return "Se produce aqui";
  if (mode === "sells_finished_good") return "Se vende terminado";
  if (mode === "prepares_to_order") return "Se prepara al momento";
  if (mode === "stored_for_production") return "Se almacena y se consume";
  return "No maneja inventario";
}

function usageHelp(mode: string) {
  if (mode === "produces_here") {
    return "Fabrica este producto: descuenta ingredientes desde LOC origen y recibe terminado en LOC destino.";
  }
  if (mode === "sells_finished_good") {
    return "Sale como producto terminado para venta directa desde el LOC origen.";
  }
  if (mode === "prepares_to_order") {
    return "Se prepara y se vende en el momento: consume ingredientes desde el LOC origen.";
  }
  if (mode === "stored_for_production") {
    return "No se produce ni se vende aqui: se guarda y luego se consume como ingrediente de otras recetas.";
  }
  return "La sede no recibe ni descuenta este producto.";
}

async function saveRecipe(formData: FormData) {
  "use server";

  let siteId = asText(formData.get("site_id"));
  let areaId = asText(formData.get("area_id"));
  const source = asText(formData.get("source"));
  const productId = asText(formData.get("product_id"));
  let recipeSiteUses = parseRecipeSiteUses(formData);
  let primaryUse = selectPrimaryRecipeUse(recipeSiteUses);
  if (primaryUse) {
    siteId = primaryUse.siteId;
    areaId = primaryUse.areaId ?? "";
  }
  let returnBase = baseNewPath(siteId, areaId, productId, source);

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: returnBase,
    permissionCode: "production.recipes.manage",
  });

  if (!productId) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "Selecciona un producto para guardar la receta.",
      ),
    );
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
    .eq("id", productId)
    .maybeSingle();
  const productRow = (product as ProductOption | null) ?? null;

  if (!productRow || !productRow.is_active) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "El producto seleccionado no esta activo.",
      ),
    );
  }

  const productType = String(productRow.product_type ?? "")
    .trim()
    .toLowerCase();
  if (!["preparacion", "venta"].includes(productType)) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "Solo se permiten productos tipo preparacion o venta.",
      ),
    );
  }

  const routeSiteIds = Array.from(
    new Set(recipeSiteUses.map((use) => use.siteId).filter(Boolean)),
  );
  let productionRouteRows: ProductSiteProductionRouteRow[] = [];

  if (routeSiteIds.length > 0) {
    const { data: routesData, error: routesErr } = await supabase
      .from("product_site_production_routes")
      .select(
        "id,site_id,external_recipe_id,input_location_id,output_mode,output_location_id,is_default",
      )
      .eq("product_id", productId)
      .eq("is_active", true)
      .in("site_id", routeSiteIds);

    if (routesErr) {
      redirect(withQuery(returnBase, "error", routesErr.message));
    }

    productionRouteRows =
      (routesData ?? []) as ProductSiteProductionRouteRow[];
  }

  const productionRoutesBySiteId = new Map<
    string,
    ProductSiteProductionRouteRow
  >();
  for (const siteRoute of routeSiteIds) {
    const siteRoutes = productionRouteRows.filter(
      (route) => String(route.site_id ?? "").trim() === siteRoute,
    );
    const selectedRoute =
      siteRoutes.find((route) => Boolean(route.is_default)) ??
      siteRoutes[0] ??
      null;
    if (selectedRoute) {
      productionRoutesBySiteId.set(siteRoute, selectedRoute);
    }
  }

  recipeSiteUses = recipeSiteUses.map((use) => {
    if (
      use.usageMode !== "produces_here" &&
      use.usageMode !== "prepares_to_order"
    ) {
      return use;
    }

    const route = productionRoutesBySiteId.get(use.siteId) ?? null;
    if (!route) return use;

    const outputMode = String(route.output_mode ?? "inventory_stock").trim();

    return {
      ...use,
      sourceLocationId: use.sourceLocationId || route.input_location_id || null,
      destinationLocationId:
        use.destinationLocationId ||
        (outputMode === "order_fulfillment"
          ? null
          : route.output_location_id || null),
    };
  });

  const recipeUseLocationIds = Array.from(
    new Set(
      recipeSiteUses
        .flatMap((use) => [
          use.sourceLocationId,
          use.destinationLocationId,
        ])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let recipeUseLocationRows: Array<{
    id: string;
    site_id: string | null;
    area_id: string | null;
    is_active: boolean | null;
  }> = [];

  if (recipeUseLocationIds.length > 0) {
    const { data: locationRows, error: locationRowsErr } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,is_active")
      .in("id", recipeUseLocationIds);

    if (locationRowsErr) {
      redirect(withQuery(returnBase, "error", locationRowsErr.message));
    }

    recipeUseLocationRows = (locationRows ?? []) as typeof recipeUseLocationRows;
  }

  const recipeUseLocationById = new Map(
    recipeUseLocationRows.map((location) => [location.id, location]),
  );

  recipeSiteUses = recipeSiteUses.map((use) => {
    const sourceLocation = use.sourceLocationId
      ? recipeUseLocationById.get(use.sourceLocationId)
      : null;
    const destinationLocation = use.destinationLocationId
      ? recipeUseLocationById.get(use.destinationLocationId)
      : null;

    if (use.sourceLocationId && !sourceLocation) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC origen seleccionado no existe o no esta disponible.",
        ),
      );
    }

    if (use.destinationLocationId && !destinationLocation) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC destino seleccionado no existe o no esta disponible.",
        ),
      );
    }

    if (
      sourceLocation?.site_id &&
      String(sourceLocation.site_id) !== use.siteId
    ) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC origen seleccionado pertenece a otra sede.",
        ),
      );
    }

    if (
      destinationLocation?.site_id &&
      String(destinationLocation.site_id) !== use.siteId
    ) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC destino seleccionado pertenece a otra sede.",
        ),
      );
    }

    const sourceAreaId = sourceLocation?.area_id
      ? String(sourceLocation.area_id)
      : "";
    const destinationAreaId = destinationLocation?.area_id
      ? String(destinationLocation.area_id)
      : "";

    if (use.usageMode === "no_inventory") {
      return {
        ...use,
        areaId: null,
        sourceLocationId: null,
        destinationLocationId: null,
      };
    }

    if (
      use.usageMode === "stored_for_production" ||
      use.usageMode === "sells_finished_good"
    ) {
      return {
        ...use,
        areaId: sourceAreaId || null,
        destinationLocationId: null,
      };
    }

    if (
      use.areaId &&
      sourceAreaId &&
      sourceAreaId !== use.areaId
    ) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC origen no pertenece al area del uso. Cambia el area o selecciona un LOC de esa area.",
        ),
      );
    }

    if (
      use.usageMode === "produces_here" &&
      use.areaId &&
      destinationAreaId &&
      destinationAreaId !== use.areaId
    ) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "El LOC destino no pertenece al area del uso. Cambia el area o selecciona un LOC de esa area.",
        ),
      );
    }

    return use;
  });

  primaryUse = selectPrimaryRecipeUse(recipeSiteUses);
  if (primaryUse) {
    siteId = primaryUse.siteId;
    areaId = primaryUse.areaId ?? "";
    returnBase = baseNewPath(siteId, areaId, productId, source);
  }

  const ingredientRaw = asText(formData.get("ingredient_lines"));
  let ingredientLines: IngredientLine[] = [];
  if (ingredientRaw) {
    try {
      ingredientLines = JSON.parse(ingredientRaw) as IngredientLine[];
    } catch {
      redirect(
        withQuery(returnBase, "error", "Formato inválido en ingredientes."),
      );
    }
  }

  const normalizedIngredients = ingredientLines
    .filter((line) => !line._delete)
    .map((line) => ({
      ingredient_product_id: String(line.ingredient_product_id || "").trim(),
      quantity: Number(line.quantity ?? 0),
    }))
    .filter(
      (line) =>
        line.ingredient_product_id &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0,
    );

  const stepsRaw = asText(formData.get("recipe_steps"));
  let steps: RecipeStepLine[] = [];
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw) as RecipeStepLine[];
    } catch {
      redirect(withQuery(returnBase, "error", "Formato inválido en pasos."));
    }
  }

  const normalizedStepDraft = steps
    .filter((step) => !step._delete)
    .map((step) => ({
      description: String(step.description ?? "").trim(),
      tip: String(step.tip ?? "").trim() || null,
      time_minutes:
        Number.isFinite(Number(step.time_minutes)) &&
        Number(step.time_minutes) >= 0
          ? Number(step.time_minutes)
          : null,
      image_path: String(step.step_image_url ?? "").trim() || null,
      original_order:
        Number.isFinite(Number(step.step_number)) &&
        Number(step.step_number) > 0
          ? Number(step.step_number)
          : 9999,
    }))
    .filter((step) => step.description.length > 0)
    .sort((a, b) => a.original_order - b.original_order);

  const statusRaw = (asText(formData.get("status")) || "draft").toLowerCase();
  const status: "draft" | "published" | "archived" =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";
  const yieldQty = asPositive(formData.get("yield_qty"), 1);
  const yieldUnit =
    asText(formData.get("yield_unit")) || productRow.unit || "un";
  const portionSize = asNullableNumber(formData.get("portion_size"));
  const portionUnit = asText(formData.get("portion_unit")) || null;
  const recipeOutputs = parseRecipeOutputs(asText(formData.get("recipe_outputs")))
    .filter((output) => !output._delete)
    .map((output) => ({
      product_id: String(output.product_id ?? "").trim(),
      output_role: output.output_role === "by_product" ? "by_product" : "co_product",
      expected_qty: Number(output.expected_qty ?? 0),
      expected_unit: String(output.expected_unit ?? "").trim() || yieldUnit,
      cost_allocation_pct: Number(output.cost_allocation_pct ?? 0),
      sort_order: Number(output.sort_order ?? 100),
    }))
    .filter(
      (output) =>
        output.product_id &&
        output.product_id !== productId &&
        Number.isFinite(output.expected_qty) &&
        output.expected_qty > 0 &&
        Number.isFinite(output.cost_allocation_pct) &&
        output.cost_allocation_pct >= 0,
    );
  const secondaryCostPct = recipeOutputs.reduce((total, output) => total + output.cost_allocation_pct, 0);

  if (secondaryCostPct > 100.000001) {
    redirect(withQuery(returnBase, "error", "El porcentaje de costo de outputs no puede superar 100%."));
  }

  if (status === "published") {
    if (recipeSiteUses.length <= 0) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes seleccionar al menos una sede donde aplica la receta.",
        ),
      );
    }
    if (!siteId || !areaId) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes seleccionar una sede productiva o de preparacion con area.",
        ),
      );
    }
    if (!yieldQty || yieldQty <= 0 || !yieldUnit) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes completar rendimiento y unidad.",
        ),
      );
    }
    if (!portionSize || portionSize <= 0 || !portionUnit) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes completar porcion y unidad de porcion.",
        ),
      );
    }
    if (normalizedIngredients.length <= 0) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes tener al menos 1 ingrediente activo en BOM.",
        ),
      );
    }
    if (normalizedStepDraft.length <= 0) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Para publicar debes tener al menos 1 paso de preparacion.",
        ),
      );
    }
  }

  for (const use of recipeSiteUses) {
    if (
      (use.usageMode === "produces_here" ||
        use.usageMode === "prepares_to_order") &&
      (!use.areaId || !use.sourceLocationId)
    ) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Configura en NEXO el area y LOC de insumos para las sedes que producen o preparan al momento.",
        ),
      );
    }
    if (use.usageMode === "produces_here" && !use.destinationLocationId) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Configura en NEXO el LOC donde queda el terminado para las sedes que producen aqui.",
        ),
      );
    }
    if (use.usageMode === "sells_finished_good" && !use.sourceLocationId) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Las sedes que venden terminado necesitan LOC de salida.",
        ),
      );
    }
    if (use.usageMode === "stored_for_production" && !use.sourceLocationId) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Las sedes que almacenan para producir necesitan LOC donde queda disponible para consumo.",
        ),
      );
    }
  }

  if (areaId) {
    const { data: rpcValidAreas } = siteId
      ? await supabase.rpc("fogo_recipe_area_options", { p_site_id: siteId })
      : { data: [] as AreaOption[] };
    let validAreas = (rpcValidAreas ?? []) as AreaOption[];
    if (siteId && validAreas.length === 0) {
      const { data: fallbackAreasData } = await supabase
        .from("areas")
        .select("id,code,name,kind,site_id")
        .eq("site_id", siteId)
        .eq("is_active", true);
      validAreas = (fallbackAreasData ?? []) as AreaOption[];
    }
    const area =
      validAreas.find(
        (option) => option.id === areaId,
      ) ?? null;
    if (!area) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "Selecciona un area productiva valida para el recetario.",
        ),
      );
    }
  }

  if (normalizedIngredients.length > 0) {
    const ingredientProductIds = Array.from(
      new Set(normalizedIngredients.map((line) => line.ingredient_product_id)),
    );
    const { data: dependencyRows, error: dependencyError } = await supabase
      .from("recipes")
      .select("product_id,ingredient_product_id")
      .eq("is_active", true);

    if (dependencyError) {
      redirect(withQuery(returnBase, "error", dependencyError.message));
    }

    const cyclePath = findRecipeCyclePath(
      productId,
      ingredientProductIds,
      (dependencyRows ?? []) as RecipeDependencyRow[],
    );
    if (cyclePath) {
      redirect(
        withQuery(
          returnBase,
          "error",
          "La receta crea un ciclo entre productos. Revisa los ingredientes antes de guardar.",
        ),
      );
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
    process_config:
      parseJsonObject(asText(formData.get("process_config"))) ?? {},
    status,
    is_active: asText(formData.get("is_active")) === "1",
  };
  if (siteId) recipePayload.site_id = siteId;
  recipePayload.area_id = areaId || null;

  const { data: existingCard, error: existingCardErr } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  if (existingCardErr) {
    redirect(withQuery(returnBase, "error", existingCardErr.message));
  }

  if (existingCard?.id) {
    redirect(
      withQuery(
        recipeEditPath(String(existingCard.id), siteId, areaId, productId, source),
        "error",
        "Este producto ya tiene una receta asociada. Te enviamos a la edición de la receta existente.",
      ),
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("recipe_cards")
    .insert(recipePayload)
    .select("id")
    .single();
  if (insertErr || !inserted?.id) {
    redirect(
      withQuery(
        returnBase,
        "error",
        insertErr?.message || "No se pudo crear la receta.",
      ),
    );
  }
  const recipeCardId = String(inserted.id);

  if (recipeOutputs.length > 0 || secondaryCostPct < 99.999999) {
    const outputRows = [
      {
        recipe_card_id: recipeCardId,
        product_id: productId,
        output_role: "primary",
        expected_qty: yieldQty,
        expected_unit: yieldUnit,
        cost_allocation_method: "percentage",
        cost_allocation_pct: Number((100 - secondaryCostPct).toFixed(6)),
        sort_order: 1,
        is_active: true,
      },
      ...recipeOutputs.map((output, index) => ({
        recipe_card_id: recipeCardId,
        product_id: output.product_id,
        output_role: output.output_role,
        expected_qty: output.expected_qty,
        expected_unit: output.expected_unit,
        cost_allocation_method: "percentage",
        cost_allocation_pct: output.cost_allocation_pct,
        sort_order: output.sort_order || index + 2,
        is_active: true,
      })),
    ];

    const { error: outputsErr } = await supabase.from("recipe_outputs").insert(outputRows);
  if (outputsErr) {
      redirect(withQuery(returnBase, "error", outputsErr.message));
    }
  }

  if (recipeSiteUses.length > 0) {
    const { error: insertUsesErr } = await supabase
      .from("recipe_site_uses")
      .insert(
        recipeSiteUses.map((use) => ({
          recipe_card_id: recipeCardId,
          product_id: productId,
          site_id: use.siteId,
          usage_mode: use.usageMode,
          area_id: use.areaId,
          source_location_id: use.sourceLocationId,
          destination_location_id: use.destinationLocationId,
          is_active: true,
          updated_by: null,
        })),
      );
    if (insertUsesErr) {
      redirect(withQuery(returnBase, "error", insertUsesErr.message));
    }

    const { error: settingsErr } = await supabase
      .from("product_site_settings")
      .upsert(
        recipeSiteUses.map((use) => {
          const producesLocally =
            use.usageMode === "produces_here" ||
            use.usageMode === "prepares_to_order";
          const sells =
            use.usageMode === "sells_finished_good" ||
            use.usageMode === "prepares_to_order";
          const keepsInventory = use.usageMode !== "no_inventory";

          return {
            product_id: productId,
            site_id: use.siteId,
            is_active: keepsInventory,
            local_production_enabled: producesLocally,
            sales_enabled: sells || null,
            inventory_enabled: keepsInventory,
            production_location_id: producesLocally
              ? use.sourceLocationId
              : null,
          };
        }),
        { onConflict: "product_id,site_id" },
      );
    if (settingsErr) {
      redirect(withQuery(returnBase, "error", settingsErr.message));
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
    const { error: insertIngredientsErr } = await supabase
      .from("recipes")
      .insert(
        normalizedIngredients.map((line) => ({
          product_id: productId,
          ingredient_product_id: line.ingredient_product_id,
          quantity: line.quantity,
          is_active: true,
        })),
      );
    if (insertIngredientsErr) {
      redirect(withQuery(returnBase, "error", insertIngredientsErr.message));
    }
  }

  // Auto-costo receta: suma ingredientes / rendimiento expresado en unidad base del producto.
  // Aplica aunque el modo en NEXO sea manual para preparaciones/venta.
  if (normalizedIngredients.length > 0) {
    const ingredientIds = Array.from(
      new Set(normalizedIngredients.map((line) => line.ingredient_product_id)),
    );
    const { data: ingredientProducts } = await supabase
      .from("products")
      .select("id,cost")
      .in("id", ingredientIds);

    const ingredientCostMap = new Map<string, number>();
    for (const row of (ingredientProducts ?? []) as Array<{
      id: string;
      cost: number | null;
    }>) {
      ingredientCostMap.set(row.id, Number(row.cost ?? 0));
    }

    const totalIngredientCost = normalizedIngredients.reduce((acc, line) => {
      const unitCost = ingredientCostMap.get(line.ingredient_product_id) ?? 0;
      return acc + unitCost * Number(line.quantity);
    }, 0);

    const yieldQtyRaw = Number(recipePayload.yield_qty ?? 0);
    const yieldUnitCode = normalizeUnitCode(
      String(recipePayload.yield_unit ?? ""),
    );
    const stockUnitCode = normalizeUnitCode(
      String(productRow.stock_unit_code ?? productRow.unit ?? ""),
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
        (
          (unitsData ?? []) as Array<{
            code: string;
            family: string | null;
            factor_to_base: number | null;
          }>
        ).map((row) => [normalizeUnitCode(row.code), row]),
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

    if (
      yieldQtyInStockUnit > 0 &&
      Number.isFinite(totalIngredientCost) &&
      totalIngredientCost >= 0
    ) {
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

  const normalizedSteps = normalizedStepDraft.map((step, index) => ({
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

function RecipeFormSafetyScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  var form = document.getElementById("fogo-recipe-form");
  if (!form) return;

  var errorBox = document.getElementById("fogo-recipe-client-error");

  function fieldValue(name) {
    var field = form.querySelector('[name="' + name + '"]');
    if (!field || typeof field.value === "undefined") return "";
    return String(field.value || "").trim();
  }

  function showClientError(message) {
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = message;
    } else {
      window.alert(message);
    }

    window.requestAnimationFrame(function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  form.addEventListener("submit", function (event) {
    var status = fieldValue("status").toLowerCase() || "draft";

    var enabledSiteUses = Array.prototype.slice
      .call(form.querySelectorAll('input[name^="site_use_enabled_"]'))
      .some(function (field) {
        return field.checked || field.value === "1";
      });

    if (status === "published" && !enabledSiteUses) {
      event.preventDefault();
      showClientError("Para publicar debes seleccionar al menos una sede donde aplica la receta. No se envio el formulario, asi que no se pierde lo que escribiste.");
      return false;
    }

    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }

    return true;
  });
})();
        `,
      }}
    />
  );
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
  const source = String(sp.source ?? "")
    .trim()
    .toLowerCase();
  const error = String(sp.error ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: baseNewPath(
      requestedSiteId,
      requestedAreaId,
      requestedProductId,
      source,
    ),
    permissionCode: "production.recipes.manage",
  });

  if (requestedProductId) {
    const { data: existingRecipeCard, error: existingRecipeCardError } = await supabase
      .from("recipe_cards")
      .select("id,site_id,area_id")
      .eq("product_id", requestedProductId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRecipeCardError) {
      redirect(
        withQuery(
          baseNewPath(requestedSiteId, requestedAreaId, requestedProductId, source),
          "error",
          existingRecipeCardError.message,
        ),
      );
    }

    if (existingRecipeCard?.id) {
      redirect(
        recipeEditPath(
          String(existingRecipeCard.id),
          requestedSiteId || String(existingRecipeCard.site_id ?? ""),
          requestedAreaId || String(existingRecipeCard.area_id ?? ""),
          requestedProductId,
          source,
        ),
      );
    }
  }

  const [{ data: employeeSitesRows }, { data: employeeRow }] =
    await Promise.all([
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

  const employeeSiteIds = (
    (employeeSitesRows ?? []) as Array<{ site_id: string | null }>
  )
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

  const [
    { data: recipeCardsData },
    { data: productRows },
    { data: ingredientRows },
    { data: unitsData },
  ] = await Promise.all([
    supabase
      .from("recipe_cards")
      .select(
        "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,process_config,status,is_active",
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
      .select("id,name,sku,unit,stock_unit_code,cost,product_type,is_active,product_inventory_profiles(inventory_kind)")
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
  const ingredientOptions = ((ingredientRows ?? []) as ProductOption[]).filter(isRecipeIngredientOption);
  const units = (unitsData ?? []) as UnitOption[];

  const recipeProductIds = new Set(
    recipeCards
      .map((card) => String(card.product_id ?? "").trim())
      .filter(Boolean),
  );
  const productsWithoutRecipe = products.filter(
    (product) => !recipeProductIds.has(product.id),
  );
  const requestedProduct = requestedProductId
    ? (products.find((product) => product.id === requestedProductId) ?? null)
    : null;
  const requestedProductHasRecipe = requestedProductId
    ? recipeProductIds.has(requestedProductId)
    : false;
  const requestedProductIsAvailable = requestedProductId
    ? productsWithoutRecipe.some((product) => product.id === requestedProductId)
    : false;

  const selectedProductId = requestedProductIsAvailable
    ? requestedProductId
    : "";
  const selectedProduct =
    productsWithoutRecipe.find((row) => row.id === selectedProductId) ?? null;

  const [
    { data: productSiteSettingsData },
    { data: allAreasData },
    { data: inventoryLocationsData },
  ] = selectedProductId
    ? await Promise.all([
        supabase
          .from("product_site_settings")
          .select(
            "site_id,product_id,is_active,local_production_enabled,sales_enabled,inventory_enabled,production_location_id",
          )
          .eq("product_id", selectedProductId),
        employeeSiteIds.length
          ? supabase
              .from("areas")
              .select("id,code,name,kind,site_id")
              .in("site_id", employeeSiteIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [] as AreaOption[] }),
        employeeSiteIds.length
          ? supabase
              .from("inventory_locations")
              .select(
                "id,site_id,area_id,code,zone,description,location_type,is_active",
              )
              .in("site_id", employeeSiteIds)
              .eq("is_active", true)
              .order("code", { ascending: true })
          : Promise.resolve({ data: [] as InventoryLocationOption[] }),
      ])
    : [
        { data: [] as ProductSiteSettingRow[] },
        { data: [] as AreaOption[] },
        { data: [] as InventoryLocationOption[] },
      ];

  const productSiteSettings = (productSiteSettingsData ??
    []) as ProductSiteSettingRow[];
  const allAreas = ((allAreasData ?? []) as AreaOption[])
    .filter((area) => !isStandalonePanaderiaArea(area))
    .sort(sortProductionAreas);
  const inventoryLocations = (inventoryLocationsData ??
    []) as InventoryLocationOption[];
  const productSiteSettingBySiteId = new Map(
    productSiteSettings.map((setting) => [setting.site_id, setting]),
  );
  const areasBySiteId = allAreas.reduce((map, area) => {
    const key = String(area.site_id ?? "");
    if (!key) return map;
    const list = map.get(key) ?? [];
    list.push(area);
    map.set(key, list);
    return map;
  }, new Map<string, AreaOption[]>());
  const locationsBySiteId = inventoryLocations.reduce((map, location) => {
    const list = map.get(location.site_id) ?? [];
    list.push(location);
    map.set(location.site_id, list);
    return map;
  }, new Map<string, InventoryLocationOption[]>());
  const areaNameById = new Map(
    allAreas.map((area) => [area.id, areaLabel(area)]),
  );
  const locationOptionLabel = (location: InventoryLocationOption) => {
    const areaName = location.area_id
      ? areaNameById.get(location.area_id)
      : "";
    return areaName
      ? `${locationLabel(location)} · ${areaName}`
      : `${locationLabel(location)} · Sin area`;
  };
  const locationOptionsForArea = (
    locations: InventoryLocationOption[],
    selectedAreaId: string,
    selectedLocationId: string,
  ) => {
    const selected = locations.find((location) => location.id === selectedLocationId);
    if (!selectedAreaId) return locations;

    const matching = locations.filter(
      (location) => String(location.area_id ?? "") === selectedAreaId,
    );
    const unassigned = locations.filter((location) => !location.area_id);

    if (matching.length > 0) {
      const options = [...matching, ...unassigned];
      if (selected && !options.some((location) => location.id === selected.id)) {
        options.push(selected);
      }
      return options;
    }

    if (locations.length === 1) return locations;
    if (selected) return [selected, ...locations.filter((location) => location.id !== selected.id)];

    return locations;
  };

  const initialIngredientLines: IngredientLine[] = [];
  const initialSteps: RecipeStepLine[] = [];

  const defaultYieldUnit = selectedProduct?.unit || "un";
  const formSiteId = requestedSiteId || resolvedSiteId;
  const productSelectionWarning = requestedProductId
    ? requestedProductIsAvailable
      ? ""
      : requestedProductHasRecipe
      ? "Este producto ya tiene una receta asociada. Para cambiarla, entra desde la receta existente y usa edición."
      : requestedProduct
        ? "No fue posible seleccionar este producto para nueva receta. Revisa que este activo y sea de tipo preparacion o venta."
        : "El producto solicitado no existe o no esta disponible para crear receta."
    : "";

  let recipeAreasData: AreaOption[] = [];
  if (formSiteId) {
    const { data: rpcAreasData } = await supabase.rpc(
      "fogo_recipe_area_options",
      {
        p_site_id: formSiteId,
      },
    );
    recipeAreasData = (rpcAreasData ?? []) as AreaOption[];
    if (recipeAreasData.length === 0) {
      const { data: fallbackAreasData } = await supabase
        .from("areas")
        .select("id,code,name,kind")
        .eq("site_id", formSiteId)
        .eq("is_active", true);
      recipeAreasData = (fallbackAreasData ?? []) as AreaOption[];
    }
  }
  const areas = recipeAreasData
    .filter((area) => !isStandalonePanaderiaArea(area))
    .sort(sortProductionAreas);

  const formAreaId =
    requestedAreaId && areas.some((area) => area.id === requestedAreaId)
      ? requestedAreaId
      : "";

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const configuredSiteIds = new Set(
    productSiteSettings
      .filter(
        (setting) =>
          setting.is_active ||
          setting.local_production_enabled ||
          setting.sales_enabled ||
          setting.inventory_enabled,
      )
      .map((setting) => setting.site_id)
      .filter(Boolean),
  );
  const visibleRecipeUseSiteIds = new Set<string>();

  for (const siteId of configuredSiteIds) visibleRecipeUseSiteIds.add(siteId);
  if (formSiteId) visibleRecipeUseSiteIds.add(formSiteId);

  const visibleRecipeUseSites = Array.from(visibleRecipeUseSiteIds)
    .map((siteId) => siteById.get(siteId))
    .filter((site): site is SiteOption => Boolean(site))
    .sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"));

  const recipeUseSites = visibleRecipeUseSites.length > 0 ? visibleRecipeUseSites : sites;
  const recipeUseRows = recipeUseSites.map((site) => {
    const setting = productSiteSettingBySiteId.get(site.id) ?? null;
    const isCurrentRecipeSite = formSiteId === site.id;
    const productSiteEnabled = Boolean(
      setting?.is_active ||
      setting?.local_production_enabled ||
      setting?.sales_enabled ||
      setting?.inventory_enabled,
    );
    const usageMode =
      productSiteEnabled
        ? setting?.local_production_enabled
          ? "produces_here"
          : setting?.sales_enabled
            ? "sells_finished_good"
            : setting?.inventory_enabled
              ? "stored_for_production"
              : "stored_for_production"
        : isCurrentRecipeSite
          ? "produces_here"
          : "stored_for_production";
    const enabled = Boolean(isCurrentRecipeSite || productSiteEnabled);
    const siteAreas = areasBySiteId.get(site.id) ?? [];
    const siteLocations = locationsBySiteId.get(site.id) ?? [];
    const selectedSourceLocationId = setting?.production_location_id ?? "";
    const sourceLocationAreaId = selectedSourceLocationId
      ? siteLocations.find((location) => location.id === selectedSourceLocationId)?.area_id ?? ""
      : "";
    const selectedAreaId =
      (isCurrentRecipeSite && formAreaId ? formAreaId : "") ||
      sourceLocationAreaId ||
      siteAreas[0]?.id ||
      "";

    return {
      site,
      enabled,
      usageMode,
      isProductionCenter: String(site.site_type ?? "").trim() === "production_center",
      areas: siteAreas,
      locations: siteLocations,
      selectedAreaId,
      selectedSourceLocationId,
      selectedDestinationLocationId: "",
    };
  });
  const visibleRecipeUseRows = recipeUseRows.filter((row) => !row.isProductionCenter);

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">Nueva receta</h1>
        <p className="mt-2 ui-body-muted">
          Crea una ficha tecnica solo para productos activos que todavia no
          tienen receta asociada.
        </p>
        {source === "nexo" ? (
          <div className="mt-3 ui-alert ui-alert--neutral">
            Llegaste desde NEXO. Termina la receta aqui y quedara disponible
            para produccion en FOGO.
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 ui-alert ui-alert--warn">{error}</div>
        ) : null}
        {productSelectionWarning ? (
          <div className="mt-3 ui-alert ui-alert--warn">
            {productSelectionWarning}
          </div>
        ) : null}
        {productsWithoutRecipe.length === 0 ? (
          <div className="mt-3 ui-alert ui-alert--neutral">
            No hay productos activos de preparacion o venta pendientes por
            receta.
          </div>
        ) : null}
        <div
          id="fogo-recipe-client-error"
          className="mt-3 ui-alert ui-alert--warn"
          hidden
        />
      </section>

      <RecipeFormSafetyScript />

      <form id="fogo-recipe-form" action={saveRecipe} className="space-y-6">
        <section className="ui-panel space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="source" value={source || "fogo"} />
            <RecipeContextSelectors
              initialSiteId={formSiteId}
              initialAreaId={formAreaId}
              initialProductId={selectedProductId}
              source={source || "fogo"}
              sites={sites.map((site) => ({ id: site.id, name: site.name }))}
              areas={areas.map((area) => ({
                id: area.id,
                name: area.name,
                kind: area.kind,
              }))}
              products={productsWithoutRecipe.map((product) => ({
                id: product.id,
                name: product.name,
                sku: product.sku,
                product_type: product.product_type,
              }))}
              recipeCards={recipeCards.map((card) => ({
                product_id: card.product_id,
              }))}
            />

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select name="status" defaultValue="draft" className="ui-input">
                <option value="draft">Borrador</option>
                <option value="published">Publicada</option>
                <option value="archived">Archivada</option>
              </select>
              <span className="text-xs text-[var(--ui-muted)]">
                Para publicar: rendimiento + porcion completos, minimo 1
                ingrediente y 1 paso.
              </span>
            </label>

            <label className="flex items-center gap-2 pt-8">
              <input
                type="checkbox"
                name="is_active"
                value="1"
                defaultChecked
              />
              <span className="ui-label">Receta activa</span>
            </label>
          </div>
        </section>

        <section className="ui-panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Disponibilidad por sede</h2>
              <p className="mt-1 max-w-3xl text-sm text-[var(--ui-muted)]">
                Marca los satelites donde aplica esta receta. El centro produce
                para remision y la ruta de LOCs se toma de NEXO.
              </p>
            </div>
            <span className="ui-chip">
              {visibleRecipeUseRows.filter((row) => row.enabled).length} activa(s)
            </span>
          </div>

          {recipeUseRows
            .filter((row) => row.isProductionCenter)
            .map((row) => (
              <div key={`hidden-${row.site.id}`} hidden>
                <input name="site_use_site_id" value={row.site.id} readOnly />
                {row.enabled ? (
                  <input
                    name={`site_use_enabled_${row.site.id}`}
                    value="1"
                    readOnly
                  />
                ) : null}
                <input
                  name={`site_use_mode_${row.site.id}`}
                  value={row.usageMode}
                  readOnly
                />
                <input
                  name={`site_use_area_${row.site.id}`}
                  value={row.selectedAreaId}
                  readOnly
                />
                <input
                  name={`site_use_source_loc_${row.site.id}`}
                  value={row.selectedSourceLocationId}
                  readOnly
                />
                <input
                  name={`site_use_destination_loc_${row.site.id}`}
                  value={row.selectedDestinationLocationId}
                  readOnly
                />
              </div>
            ))}

          <div className="grid gap-4 lg:grid-cols-2">
            {visibleRecipeUseRows.length ? (
              visibleRecipeUseRows.map((row) => {
                const sourceLocationOptions = locationOptionsForArea(
                  row.locations,
                  row.selectedAreaId,
                  row.selectedSourceLocationId,
                );
                const destinationLocationOptions = locationOptionsForArea(
                  row.locations,
                  row.selectedAreaId,
                  row.selectedDestinationLocationId,
                );

                return (
                  <div
                    key={row.site.id}
                    className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
                  >
                    <input
                      type="hidden"
                      name="site_use_site_id"
                      value={row.site.id}
                    />

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          name={`site_use_enabled_${row.site.id}`}
                          value="1"
                          defaultChecked={row.enabled}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-[var(--ui-text)]">
                            {siteLabel(row.site)}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--ui-muted)]">
                            {row.site.site_type ?? "sede"}
                          </span>
                        </span>
                      </label>

                      <span className={`ui-chip ${row.enabled ? "ui-chip--success" : ""}`}>
                        {row.enabled ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="block space-y-1">
                        <span className="ui-label">Uso operativo</span>
                        <select
                          name={`site_use_mode_${row.site.id}`}
                          defaultValue={row.usageMode}
                          className="ui-input w-full bg-white"
                          aria-label={`Uso de ${siteLabel(row.site)}`}
                        >
                          <option value="produces_here">
                            {usageLabel("produces_here")}
                          </option>
                          <option value="stored_for_production">
                            {usageLabel("stored_for_production")}
                          </option>
                          <option value="sells_finished_good">
                            {usageLabel("sells_finished_good")}
                          </option>
                          <option value="prepares_to_order">
                            {usageLabel("prepares_to_order")}
                          </option>
                          <option value="no_inventory">
                            {usageLabel("no_inventory")}
                          </option>
                        </select>
                        <span className="block text-xs leading-5 text-[var(--ui-muted)]">
                          {usageHelp(row.usageMode)}
                        </span>
                      </label>

                      <details className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                          Ajuste avanzado de LOCs
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <label className="block min-w-0 space-y-1">
                            <span className="ui-label">Area</span>
                            <select
                              name={`site_use_area_${row.site.id}`}
                              defaultValue={row.selectedAreaId}
                              className="ui-input w-full bg-white"
                              aria-label={`Area de ${siteLabel(row.site)}`}
                            >
                              <option value="">Sin area</option>
                              {row.areas.map((area) => (
                                <option key={area.id} value={area.id}>
                                  {areaLabel(area)}
                                </option>
                              ))}
                            </select>
                            <span className="block text-xs text-[var(--ui-muted)]">
                              {row.areas.length} area(s)
                            </span>
                          </label>

                          <label className="block min-w-0 space-y-1">
                            <span className="ui-label">LOC origen / salida</span>
                            <select
                              name={`site_use_source_loc_${row.site.id}`}
                              defaultValue={row.selectedSourceLocationId}
                              className="ui-input w-full bg-white"
                              aria-label={`LOC origen de ${siteLabel(row.site)}`}
                            >
                              <option value="">Sin LOC</option>
                              {sourceLocationOptions.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {locationOptionLabel(location)}
                                </option>
                              ))}
                            </select>
                            <span className="block text-xs text-[var(--ui-muted)]">
                              {sourceLocationOptions.length} LOC(s) disponible(s)
                            </span>
                          </label>

                          <label className="block min-w-0 space-y-1">
                            <span className="ui-label">LOC destino</span>
                            <select
                              name={`site_use_destination_loc_${row.site.id}`}
                              defaultValue={row.selectedDestinationLocationId}
                              className="ui-input w-full bg-white"
                              aria-label={`LOC destino de ${siteLabel(row.site)}`}
                            >
                              <option value="">Sin LOC</option>
                              {destinationLocationOptions.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {locationOptionLabel(location)}
                                </option>
                              ))}
                            </select>
                            <span className="block text-xs text-[var(--ui-muted)]">
                              Solo requerido cuando esta sede produce el item.
                            </span>
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-8 text-center text-[var(--ui-muted)]">
                No hay sedes disponibles para configurar.
              </div>
            )}
          </div>
        </section>

        <RecipeBaseFields
          key={`base-${selectedProductId || "new"}`}
          initialYieldQty={1}
          initialYieldUnit={defaultYieldUnit}
          initialPortionSize={null}
          initialPortionUnit={null}
          initialPrepTimeMinutes={null}
          initialShelfLifeDays={null}
          initialDifficulty={null}
          initialDescription={null}
          initialProcessConfig={null}
          units={units}
          nexoCatalogUrl={
            selectedProductId
              ? `${NEXO_BASE_URL}/inventory/catalog/${encodeURIComponent(selectedProductId)}`
              : `${NEXO_BASE_URL}/inventory/catalog`
          }
        />

        <RecipeOutputsEditor
          key={`outputs-${selectedProductId || "new"}`}
          primaryProductId={selectedProductId}
          primaryProductName={selectedProduct?.name ?? "Producto principal"}
          primaryUnit={defaultYieldUnit}
          yieldQty={1}
          products={products}
        />

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Ingredientes (BOM)</h2>
          <RecipeIngredientsEditor
            key={`bom-${selectedProductId || "new"}`}
            initialRows={initialIngredientLines}
            products={ingredientOptions}
          />
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Pasos de preparacion</h2>
          <RecipeStepsEditor
            key={`steps-${selectedProductId || "new"}`}
            initialRows={initialSteps}
          />
        </section>

        <section className="ui-mobile-sticky-footer">
          <div className="ui-panel flex flex-wrap items-center justify-end gap-2">
            <a
              href={
                resolvedSiteId
                  ? `/recipes?site_id=${encodeURIComponent(resolvedSiteId)}`
                  : "/recipes"
              }
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
