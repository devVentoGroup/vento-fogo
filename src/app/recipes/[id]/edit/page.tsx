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

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";
const RECIPE_STEP_PHOTOS_BUCKET =
  process.env.FOGO_RECIPE_STEP_PHOTOS_BUCKET ||
  process.env.NEXT_PUBLIC_FOGO_RECIPE_STEP_PHOTOS_BUCKET ||
  "recipe-step-photos";
const MAX_RECIPE_STEP_PHOTO_BYTES = 1500 * 1024;
const ALLOWED_RECIPE_STEP_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

type RecipeSiteUseRow = {
  id: string;
  recipe_card_id: string;
  product_id: string;
  site_id: string;
  usage_mode: string;
  area_id: string | null;
  source_location_id: string | null;
  destination_location_id: string | null;
  is_active: boolean;
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

function normalizeStoredImageValue(value: unknown) {
  const imageValue = String(value ?? "").trim();
  return imageValue || null;
}

function fileExtensionFromMime(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function asRecipeStepImageFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) return null;
  if (!value.name || value.size <= 0) return null;
  return value;
}

async function uploadRecipeStepPhoto({
  supabase,
  recipeCardId,
  stepNumber,
  file,
}: {
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"];
  recipeCardId: string;
  stepNumber: number;
  file: File;
}) {
  if (!ALLOWED_RECIPE_STEP_PHOTO_TYPES.has(file.type)) {
    throw new Error("La foto del paso debe ser JPG, PNG o WEBP.");
  }

  if (file.size > MAX_RECIPE_STEP_PHOTO_BYTES) {
    throw new Error("La foto del paso supera 1.5 MB después de optimizarla. Usa una imagen más liviana.");
  }

  const extension = fileExtensionFromMime(file);
  const safeRecipeId = normalizeSlug(recipeCardId) || recipeCardId.replace(/[^a-zA-Z0-9_-]/g, "");
  const objectPath = [
    "recipes",
    safeRecipeId,
    `step-${stepNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage
    .from(RECIPE_STEP_PHOTOS_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type || "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`No se pudo subir la foto del paso ${stepNumber}: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(RECIPE_STEP_PHOTOS_BUCKET)
    .getPublicUrl(objectPath);

  return data.publicUrl || objectPath;
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

function baseEditPath(
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
  const base = recipeId
    ? `/recipes/${encodeURIComponent(recipeId)}/edit`
    : "/recipes";
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

  const recipeCardId = asText(formData.get("recipe_card_id"));
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
  let returnBase = baseEditPath(
    recipeCardId,
    siteId,
    areaId,
    productId,
    source,
  );

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: returnBase,
    permissionCode: "production.recipes.manage",
  });

  if (!recipeCardId) {
    redirect(
      withQuery(
        "/recipes",
        "error",
        "No se recibio la receta que deseas editar.",
      ),
    );
  }

  const { data: currentRecipeCard, error: currentRecipeErr } = await supabase
    .from("recipe_cards")
    .select("id,product_id")
    .eq("id", recipeCardId)
    .maybeSingle();

  if (currentRecipeErr) {
    redirect(withQuery(returnBase, "error", currentRecipeErr.message));
  }

  if (!currentRecipeCard?.id) {
    redirect(
      withQuery(
        "/recipes",
        "error",
        "La receta que intentas editar no existe.",
      ),
    );
  }

  const currentProductId = String(currentRecipeCard.product_id ?? "").trim();

  if (!productId) {
    redirect(
      withQuery(returnBase, "error", "La receta no tiene producto asociado."),
    );
  }

  if (productId !== currentProductId) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "No puedes cambiar el producto asociado desde edición. Crea una receta nueva para otro producto.",
      ),
    );
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
    .eq("id", productId)
    .maybeSingle();
  const productRow = (product as ProductOption | null) ?? null;

  const statusRaw = (asText(formData.get("status")) || "draft").toLowerCase();
  const status: "draft" | "published" | "archived" =
    statusRaw === "published" || statusRaw === "archived" ? statusRaw : "draft";
  const requestedRecipeActive = asText(formData.get("is_active")) === "1";
  const recipeWillBeActive = status === "archived" ? false : requestedRecipeActive;
  const isArchivingOrDisabling = status === "archived" || !recipeWillBeActive;

  if (!productRow) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "El producto asociado a esta receta no existe.",
      ),
    );
  }

  if (isArchivingOrDisabling) {
    const { error: archiveErr } = await supabase
      .from("recipe_cards")
      .update({
        status,
        is_active: recipeWillBeActive,
      })
      .eq("id", recipeCardId);

    if (archiveErr) {
      redirect(withQuery(returnBase, "error", archiveErr.message));
    }

    const qs = new URLSearchParams();
    qs.set("saved", "1");
    qs.set(status === "archived" ? "archived" : "disabled", "1");
    if (source === "nexo") {
      qs.set("product_id", productId);
      qs.set("source", source);
    }
    redirect(`/recipes?${qs.toString()}`);
  }

  if (!productRow.is_active) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "El producto asociado a esta receta no esta activo. Solo puedes archivar o desactivar la receta.",
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
      siteRoutes.find(
        (route) =>
          String(route.external_recipe_id ?? "").trim() === recipeCardId,
      ) ??
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
    returnBase = baseEditPath(
      recipeCardId,
      siteId,
      areaId,
      productId,
      source,
    );
  }

  const { data: duplicateRecipeCard, error: duplicateRecipeErr } =
    await supabase
      .from("recipe_cards")
      .select("id")
      .eq("product_id", productId)
      .neq("id", recipeCardId)
      .maybeSingle();

  if (duplicateRecipeErr) {
    redirect(withQuery(returnBase, "error", duplicateRecipeErr.message));
  }

  if (duplicateRecipeCard?.id) {
    redirect(
      withQuery(
        returnBase,
        "error",
        "Este producto esta asociado a otra receta. Revisa duplicados antes de guardar.",
      ),
    );
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
    .map((step) => {
      const id = String(step.id ?? "").trim();
      const clientKey =
        String(step.client_key ?? "").trim() ||
        (id ? `existing-${id}` : `step-${String(step.step_number ?? "").trim() || "new"}`);

      return {
        id: id || null,
        client_key: clientKey,
        description: String(step.description ?? "").trim(),
        tip: String(step.tip ?? "").trim() || null,
        time_minutes:
          Number.isFinite(Number(step.time_minutes)) &&
          Number(step.time_minutes) >= 0
            ? Number(step.time_minutes)
            : null,
        image_path: normalizeStoredImageValue(
          step.step_image_path ?? step.step_image_url,
        ),
        remove_image: step.remove_image === true,
        original_order:
          Number.isFinite(Number(step.step_number)) &&
          Number(step.step_number) > 0
            ? Number(step.step_number)
            : 9999,
      };
    })
    .filter((step) => step.description.length > 0)
    .sort((a, b) => a.original_order - b.original_order);

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
    const { data: validAreas } = siteId
      ? await supabase.rpc("fogo_recipe_area_options", { p_site_id: siteId })
      : { data: [] as AreaOption[] };
    const area =
      ((validAreas ?? []) as AreaOption[]).find(
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
    is_active: recipeWillBeActive,
  };
  if (siteId) recipePayload.site_id = siteId;
  recipePayload.area_id = areaId || null;

  const { error: updateErr } = await supabase
    .from("recipe_cards")
    .update(recipePayload)
    .eq("id", recipeCardId);
  if (updateErr) {
    redirect(withQuery(returnBase, "error", updateErr.message));
  }

  const { error: deleteOutputsErr } = await supabase
    .from("recipe_outputs")
    .delete()
    .eq("recipe_card_id", recipeCardId);
  if (deleteOutputsErr) {
    redirect(withQuery(returnBase, "error", deleteOutputsErr.message));
  }

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

  const { error: insertOutputsErr } = await supabase
    .from("recipe_outputs")
    .insert(outputRows);
  if (insertOutputsErr) {
    redirect(withQuery(returnBase, "error", insertOutputsErr.message));
  }

  const { error: deleteUsesErr } = await supabase
    .from("recipe_site_uses")
    .delete()
    .eq("recipe_card_id", recipeCardId);
  if (deleteUsesErr) {
    redirect(withQuery(returnBase, "error", deleteUsesErr.message));
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

  const { data: existingStepImageRows, error: existingStepImageErr } =
    await supabase
      .from("recipe_steps")
      .select("id,image_path")
      .eq("recipe_card_id", recipeCardId);

  if (existingStepImageErr) {
    redirect(withQuery(returnBase, "error", existingStepImageErr.message));
  }

  const existingImagePathByStepId = new Map<string, string | null>();
  for (const row of (existingStepImageRows ?? []) as Array<{
    id: string | null;
    image_path: string | null;
  }>) {
    const stepId = String(row.id ?? "").trim();
    if (stepId) {
      existingImagePathByStepId.set(
        stepId,
        normalizeStoredImageValue(row.image_path),
      );
    }
  }

  const normalizedSteps: Array<{
    recipe_card_id: string;
    step_number: number;
    description: string;
    tip: string | null;
    time_minutes: number | null;
    image_path: string | null;
  }> = [];

  for (const [index, step] of normalizedStepDraft.entries()) {
    const stepNumber = index + 1;
    const uploadedFile = asRecipeStepImageFile(
      formData.get(`recipe_step_image_${step.client_key}`),
    );

    let imagePath =
      step.id && existingImagePathByStepId.has(step.id)
        ? existingImagePathByStepId.get(step.id) ?? null
        : step.image_path;

    if (step.remove_image) {
      imagePath = null;
    }

    if (uploadedFile) {
      try {
        imagePath = await uploadRecipeStepPhoto({
          supabase,
          recipeCardId,
          stepNumber,
          file: uploadedFile,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo subir la foto del paso.";
        redirect(withQuery(returnBase, "error", message));
      }
    }

    normalizedSteps.push({
      recipe_card_id: recipeCardId,
      step_number: stepNumber,
      description: step.description,
      tip: step.tip,
      time_minutes: step.time_minutes,
      image_path: imagePath,
    });
  }

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
    var productId = fieldValue("product_id");

    if (!productId) {
      event.preventDefault();
      showClientError("La receta no tiene producto asociado. No se envio el formulario, asi que no se pierde lo que escribiste.");
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

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params?: Promise<{ id?: string }>;
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    product_id?: string;
    source?: string;
    error?: string;
  }>;
}) {
  const routeParams = (await params) ?? {};
  const recipeCardId = String(routeParams.id ?? "").trim();

  if (!recipeCardId) {
    redirect(
      withQuery(
        "/recipes",
        "error",
        "No se recibio la receta que deseas editar.",
      ),
    );
  }

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
    returnTo: baseEditPath(
      recipeCardId,
      requestedSiteId,
      requestedAreaId,
      requestedProductId,
      source,
    ),
    permissionCode: "production.recipes.manage",
  });

  const { data: recipeCardData, error: recipeCardErr } = await supabase
    .from("recipe_cards")
    .select(
      "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,process_config,status,is_active",
    )
    .eq("id", recipeCardId)
    .maybeSingle();

  if (recipeCardErr) {
    redirect(withQuery("/recipes", "error", recipeCardErr.message));
  }

  const selectedRecipeCard = (recipeCardData as RecipeCardRow | null) ?? null;
  if (!selectedRecipeCard) {
    redirect(
      withQuery(
        "/recipes",
        "error",
        "La receta que intentas editar no existe.",
      ),
    );
  }

  const selectedProductId = String(selectedRecipeCard.product_id ?? "").trim();

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
    selectedRecipeCard.site_id ||
    employeeSiteIds[0] ||
    String(employeeRow?.site_id ?? "").trim();

  const [
    { data: selectedProductData },
    { data: outputProductRows },
    { data: ingredientRows },
    { data: unitsData },
    { data: existingIngredientRows },
    { data: existingStepsRows },
    { data: recipeOutputsData },
    { data: recipeSiteUsesData },
    { data: productSiteSettingsData },
    { data: allAreasData },
    { data: inventoryLocationsData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,cost,product_type,is_active")
      .eq("id", selectedProductId)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,cost,product_type,is_active")
      .in("product_type", ["preparacion", "venta"])
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1200),
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
    supabase
      .from("recipes")
      .select("id,ingredient_product_id,quantity")
      .eq("product_id", selectedProductId)
      .eq("is_active", true),
    supabase
      .from("recipe_steps")
      .select("id,step_number,description,tip,time_minutes,image_path")
      .eq("recipe_card_id", recipeCardId)
      .order("step_number", { ascending: true }),
    supabase
      .from("recipe_outputs")
      .select("id,product_id,output_role,expected_qty,expected_unit,cost_allocation_pct,sort_order,is_active")
      .eq("recipe_card_id", recipeCardId)
      .eq("is_active", true)
      .neq("output_role", "primary")
      .order("sort_order", { ascending: true }),
    supabase
      .from("recipe_site_uses")
      .select(
        "id,recipe_card_id,product_id,site_id,usage_mode,area_id,source_location_id,destination_location_id,is_active",
      )
      .eq("recipe_card_id", recipeCardId)
      .eq("is_active", true),
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
  ]);

  const selectedProduct = (selectedProductData as ProductOption | null) ?? null;
  const outputProductOptions = (outputProductRows ?? []) as ProductOption[];
  const ingredientOptions = (ingredientRows ?? []) as ProductOption[];
  const units = (unitsData ?? []) as UnitOption[];
  const recipeSiteUses = (recipeSiteUsesData ?? []) as RecipeSiteUseRow[];
  const productSiteSettings = (productSiteSettingsData ??
    []) as ProductSiteSettingRow[];
  const allAreas = ((allAreasData ?? []) as AreaOption[])
    .filter((area) => !isStandalonePanaderiaArea(area))
    .sort(sortProductionAreas);
  const inventoryLocations = (inventoryLocationsData ??
    []) as InventoryLocationOption[];
  const recipeSiteUseBySiteId = new Map(
    recipeSiteUses.map((use) => [use.site_id, use]),
  );
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

  const initialOutputLines: RecipeOutputLine[] = (
    (recipeOutputsData ?? []) as Array<{
      id: string;
      product_id: string;
      output_role: "co_product" | "by_product" | "primary";
      expected_qty: number;
      expected_unit: string;
      cost_allocation_pct: number | null;
      sort_order: number | null;
    }>
  ).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    output_role: row.output_role === "by_product" ? "by_product" : "co_product",
    expected_qty: Number(row.expected_qty),
    expected_unit: row.expected_unit,
    cost_allocation_pct: Number(row.cost_allocation_pct ?? 0),
    sort_order: row.sort_order ?? 100,
  }));

  const defaultYieldUnit =
    selectedRecipeCard.yield_unit || selectedProduct?.unit || "un";
  const formSiteId = resolvedSiteId;

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
    (requestedAreaId && areas.some((area) => area.id === requestedAreaId)
      ? requestedAreaId
      : "") ||
    (selectedRecipeCard.area_id &&
    areas.some((area) => area.id === selectedRecipeCard.area_id)
      ? selectedRecipeCard.area_id
      : "");

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
  for (const use of recipeSiteUses) visibleRecipeUseSiteIds.add(use.site_id);
  if (selectedRecipeCard.site_id) visibleRecipeUseSiteIds.add(selectedRecipeCard.site_id);
  if (resolvedSiteId) visibleRecipeUseSiteIds.add(resolvedSiteId);

  const visibleRecipeUseSites = Array.from(visibleRecipeUseSiteIds)
    .map((siteId) => siteById.get(siteId))
    .filter((site): site is SiteOption => Boolean(site))
    .sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"));

  const recipeUseSites = visibleRecipeUseSites.length > 0 ? visibleRecipeUseSites : sites;

  const recipeUseRows = recipeUseSites.map((site) => {
    const existingUse = recipeSiteUseBySiteId.get(site.id) ?? null;
    const setting = productSiteSettingBySiteId.get(site.id) ?? null;
    const isCurrentRecipeSite = selectedRecipeCard.site_id === site.id;
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
              : existingUse?.usage_mode ?? "stored_for_production"
        : isCurrentRecipeSite
        ? "produces_here"
        : "stored_for_production";
    const enabled = Boolean(
      isCurrentRecipeSite ||
      productSiteEnabled,
    );
    const siteAreas = areasBySiteId.get(site.id) ?? [];
    const siteLocations = locationsBySiteId.get(site.id) ?? [];
    const selectedAreaId =
      existingUse?.area_id ??
      (isCurrentRecipeSite ? selectedRecipeCard.area_id : null) ??
      "";
    const selectedSourceLocationId =
      existingUse?.source_location_id ?? setting?.production_location_id ?? "";
    const selectedDestinationLocationId =
      existingUse?.destination_location_id ?? "";

    return {
      site,
      enabled,
      usageMode,
      isProductionCenter: String(site.site_type ?? "").trim() === "production_center",
      areas: siteAreas,
      locations: siteLocations,
      selectedAreaId,
      selectedSourceLocationId,
      selectedDestinationLocationId,
    };
  });
  const visibleRecipeUseRows = recipeUseRows.filter((row) => !row.isProductionCenter);

  const productSelectionWarning =
    requestedProductId && requestedProductId !== selectedProductId
      ? "La edición conserva el producto original de la receta. Para otro producto, crea una receta nueva."
      : "";

  const inactiveProductWarning =
    selectedProduct && !selectedProduct.is_active
      ? "El producto asociado a esta receta no esta activo. Puedes archivarla o desactivarla, pero no dejarla publicada y activa."
      : "";

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">Editar receta</h1>
        <p className="mt-2 ui-body-muted">
          Actualiza la ficha tecnica, ingredientes (BOM) y pasos operativos de
          una receta existente.
        </p>
        {source === "nexo" ? (
          <div className="mt-3 ui-alert ui-alert--neutral">
            Llegaste desde NEXO. Ajusta la receta aqui y quedara disponible para
            produccion en FOGO.
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
        {inactiveProductWarning ? (
          <div className="mt-3 ui-alert ui-alert--warn">
            {inactiveProductWarning}
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
        <input type="hidden" name="recipe_card_id" value={recipeCardId} />

        <section className="ui-panel space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="source" value={source || "fogo"} />
            <input type="hidden" name="product_id" value={selectedProductId} />
            <input type="hidden" name="site_id" value={formSiteId} />
            <input type="hidden" name="area_id" value={formAreaId} />

            <div className="md:col-span-2 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
              <span className="ui-label">Producto de la receta</span>
              <div className="mt-1 font-semibold text-[var(--ui-text)]">
                {selectedProduct?.name ?? "Producto"}
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {selectedProduct?.sku
                  ? `SKU ${selectedProduct.sku}`
                  : "Sin SKU"}{" "}
                - {selectedProduct?.product_type ?? "tipo no definido"}
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select
                name="status"
                defaultValue={selectedRecipeCard.status ?? "draft"}
                className="ui-input"
              >
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
                defaultChecked={selectedRecipeCard.is_active ?? true}
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
                        <span className="ui-label">Área</span>
                        <select
                          name={`site_use_area_${row.site.id}`}
                          defaultValue={row.selectedAreaId}
                          className="ui-input w-full bg-white"
                          aria-label={`Área de ${siteLabel(row.site)}`}
                        >
                          <option value="">Sin área</option>
                          {row.areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {areaLabel(area)}
                            </option>
                          ))}
                        </select>
                        <span className="block text-xs text-[var(--ui-muted)]">
                          {row.areas.length} área(s)
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
          key={`base-${selectedProductId}-${recipeCardId}`}
          initialYieldQty={selectedRecipeCard.yield_qty ?? 1}
          initialYieldUnit={defaultYieldUnit}
          initialPortionSize={selectedRecipeCard.portion_size ?? null}
          initialPortionUnit={selectedRecipeCard.portion_unit ?? null}
          initialPrepTimeMinutes={selectedRecipeCard.prep_time_minutes ?? null}
          initialShelfLifeDays={selectedRecipeCard.shelf_life_days ?? null}
          initialDifficulty={selectedRecipeCard.difficulty ?? null}
          initialDescription={selectedRecipeCard.recipe_description ?? null}
          initialProcessConfig={selectedRecipeCard.process_config ?? null}
          units={units}
          nexoCatalogUrl={
            selectedProductId
              ? `${NEXO_BASE_URL}/inventory/catalog/${encodeURIComponent(selectedProductId)}`
              : `${NEXO_BASE_URL}/inventory/catalog`
          }
        />

        <RecipeOutputsEditor
          key={`outputs-${selectedProductId}-${recipeCardId}`}
          primaryProductId={selectedProductId}
          primaryProductName={selectedProduct?.name ?? "Producto principal"}
          primaryUnit={defaultYieldUnit}
          yieldQty={Number(selectedRecipeCard.yield_qty ?? 1)}
          products={outputProductOptions}
          initialRows={initialOutputLines}
        />

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Ingredientes (BOM)</h2>
          <RecipeIngredientsEditor
            key={`bom-${selectedProductId}-${recipeCardId}`}
            initialRows={initialIngredientLines}
            products={ingredientOptions}
          />
        </section>

        <section className="ui-panel space-y-4">
          <h2 className="ui-h2">Pasos de preparacion</h2>
          <RecipeStepsEditor
            key={`steps-${selectedProductId}-${recipeCardId}`}
            initialRows={initialSteps}
          />
        </section>

        <section className="ui-mobile-sticky-footer">
          <div className="ui-panel flex flex-wrap items-center justify-end gap-2">
            <a
              href={
                formSiteId
                  ? `/recipes?site_id=${encodeURIComponent(formSiteId)}`
                  : "/recipes"
              }
              className="ui-btn ui-btn--ghost"
            >
              Cancelar
            </a>
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar cambios
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
