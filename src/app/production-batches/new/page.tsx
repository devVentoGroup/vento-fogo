import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import {
  ProductionBatchRealForm,
  type ProductionIngredientDraft,
  type ProductionLocationOption,
  type ProductionOutputMode,
  type ProductionOutputDraft,
} from "./production-batch-real-form";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

type Relation<T> = T | T[] | null | undefined;

type ProductShape = {
  id?: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type AreaShape = {
  id: string;
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
  status: string;
  recipe_description: string | null;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientRow = {
  ingredient_product_id: string;
  quantity: number | null;
};

type IngredientProductRow = ProductShape & {
  id: string;
  cost: number | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
  location_type: string | null;
};

type StockRow = {
  location_id: string;
  product_id: string;
  current_qty: number | null;
};

type ProductSiteSettingRow = {
  production_location_id: string | null;
};

type ProductionRouteRow = {
  id: string;
  route_name: string | null;
  external_recipe_id: string | null;
  input_location_id: string;
  output_mode: "inventory_stock" | "sellable_stock" | "order_fulfillment" | string | null;
  output_location_id: string | null;
  output_position_id: string | null;
  is_default: boolean | null;
};

type RecipeRouteLookupRow = {
  id: string;
  product_id: string;
  site_id: string | null;
  area_id: string | null;
  areas?: Relation<{ kind: string | null }>;
};

type IngredientPayloadRow = {
  ingredient_product_id?: unknown;
  required_qty?: unknown;
  actual_qty?: unknown;
  location_id?: unknown;
};

type PackagePayloadRow = {
  package_index?: unknown;
  label?: unknown;
  expected_qty?: unknown;
  actual_qty?: unknown;
  unit_code?: unknown;
  uom_profile_id?: unknown;
  notes?: unknown;
};

type OutputPayloadRow = {
  recipe_output_id?: unknown;
  product_id?: unknown;
  output_role?: unknown;
  produced_qty?: unknown;
  produced_unit?: unknown;
  destination_location_id?: unknown;
  cost_allocation_pct?: unknown;
};

type RecipeOutputRow = {
  id: string;
  product_id: string;
  output_role: "primary" | "co_product" | "by_product";
  expected_qty: number | null;
  expected_unit: string | null;
  cost_allocation_pct: number | null;
  destination_location_id: string | null;
  products?: Relation<ProductShape>;
};

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundQty(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function locationLabel(location: LocationRow) {
  return [location.code, location.zone, location.description].filter(Boolean).join(" - ") || location.id;
}

function outputModeLabel(mode: string | null | undefined) {
  switch (String(mode ?? "")) {
    case "inventory_stock":
      return "Guardar como inventario";
    case "sellable_stock":
      return "Listo para vender";
    case "order_fulfillment":
      return "Pedido POS / entrega directa";
    default:
      return "Guardar como inventario";
  }
}

function normalizeProductionOutputMode(mode: string | null | undefined): ProductionOutputMode {
  if (mode === "sellable_stock") return "sellable_stock";
  if (mode === "order_fulfillment") return "order_fulfillment";
  return "inventory_stock";
}

function buildReturn(recipeId: string, qty: number, destinationLocationId: string, error?: string) {
  const qs = new URLSearchParams();
  if (recipeId) qs.set("recipe_id", recipeId);
  if (qty > 0) qs.set("qty", String(qty));
  if (destinationLocationId) qs.set("destination_location_id", destinationLocationId);
  if (error) qs.set("error", error);
  const query = qs.toString();
  return `/production-batches/new${query ? `?${query}` : ""}`;
}

function parseJsonArray<T>(raw: string, fallback: T[] = []): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function cleanNullableUuid(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

async function resolveOutputModeForRecipe(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"],
  recipeId: string
): Promise<ProductionOutputMode> {
  const { data: recipeData } = await supabase
    .from("recipe_cards")
    .select("id,product_id,site_id,area_id,areas(kind)")
    .eq("id", recipeId)
    .maybeSingle();

  const recipe = (recipeData as RecipeRouteLookupRow | null) ?? null;
  const siteId = String(recipe?.site_id ?? "").trim();
  const areaKind = String(one(recipe?.areas)?.kind ?? "").trim();

  if (!recipe?.product_id || !siteId || !areaKind) {
    return "inventory_stock";
  }

  const { data: routesData } = await supabase
    .from("product_site_production_routes")
    .select("id,route_name,external_recipe_id,input_location_id,output_mode,output_location_id,output_position_id,is_default")
    .eq("product_id", recipe.product_id)
    .eq("site_id", siteId)
    .eq("area_kind", areaKind)
    .eq("is_active", true);

  const routes = (routesData ?? []) as ProductionRouteRow[];
  const matchingRoutes = routes.filter((route) => {
    const externalRecipeId = String(route.external_recipe_id ?? "").trim();
    return !externalRecipeId || externalRecipeId === recipeId;
  });

  const route =
    matchingRoutes.find((row) => String(row.external_recipe_id ?? "").trim() === recipeId) ??
    matchingRoutes.find((row) => Boolean(row.is_default)) ??
    matchingRoutes[0] ??
    null;

  return normalizeProductionOutputMode(route?.output_mode);
}

async function createBatch(formData: FormData) {
  "use server";

  const recipeId = text(formData.get("recipe_id"));
  const destinationLocationId = text(formData.get("destination_location_id"));
  const notes = text(formData.get("notes"));
  const qty = Number(text(formData.get("qty")));
  const returnTo = buildReturn(recipeId, Number.isFinite(qty) ? qty : 0, destinationLocationId);

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: "production.recipe_book.view",
  });

  if (!recipeId || !Number.isFinite(qty) || qty <= 0) {
    redirect(buildReturn(recipeId, Number.isFinite(qty) ? qty : 0, destinationLocationId, "Completa receta y rendimiento real."));
  }

  const outputMode = await resolveOutputModeForRecipe(supabase, recipeId);
  const isOrderFulfillment = outputMode === "order_fulfillment";

  if (!isOrderFulfillment && !destinationLocationId) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, "Completa el LOC destino del terminado."));
  }

  const rawIngredients = parseJsonArray<IngredientPayloadRow>(text(formData.get("ingredients_payload")));
  const rawPackages = parseJsonArray<PackagePayloadRow>(text(formData.get("packages_payload")));
  const rawOutputs = parseJsonArray<OutputPayloadRow>(text(formData.get("outputs_payload")));

  const ingredients = rawIngredients
    .map((row) => ({
      ingredient_product_id: cleanNullableUuid(row.ingredient_product_id),
      required_qty: roundQty(numeric(row.required_qty)),
      actual_qty: roundQty(numeric(row.actual_qty)),
      location_id: cleanNullableUuid(row.location_id),
    }))
    .filter((row) => row.ingredient_product_id && row.actual_qty >= 0);

  const packages = rawPackages
    .map((row, index) => ({
      package_index: Math.max(1, Math.floor(numeric(row.package_index, index + 1))),
      label: text(typeof row.label === "string" ? row.label : null) || `Empaque ${index + 1}`,
      expected_qty: roundQty(numeric(row.expected_qty)),
      actual_qty: roundQty(numeric(row.actual_qty)),
      unit_code: text(typeof row.unit_code === "string" ? row.unit_code : null),
      uom_profile_id: cleanNullableUuid(row.uom_profile_id),
      notes: text(typeof row.notes === "string" ? row.notes : null) || null,
    }))
    .filter((row) => row.actual_qty > 0 && row.unit_code);

  const outputs = rawOutputs
    .map((row) => ({
      recipe_output_id: cleanNullableUuid(row.recipe_output_id),
      product_id: cleanNullableUuid(row.product_id),
      output_role:
        row.output_role === "by_product"
          ? "by_product"
          : row.output_role === "primary"
            ? "primary"
            : "co_product",
      produced_qty: roundQty(numeric(row.produced_qty)),
      produced_unit: text(typeof row.produced_unit === "string" ? row.produced_unit : null),
      destination_location_id: cleanNullableUuid(row.destination_location_id),
      cost_allocation_pct: roundQty(numeric(row.cost_allocation_pct), 6),
    }))
    .filter((row) => row.product_id && row.produced_qty > 0 && row.produced_unit);

  if (!ingredients.length) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, "La receta no tiene ingredientes reales para consumir."));
  }

  if (!isOrderFulfillment && !packages.length) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, "Genera o registra al menos un empaque del lote."));
  }

  const packagedQty = packages.reduce((acc, row) => acc + row.actual_qty, 0);
  if (!isOrderFulfillment && Math.abs(packagedQty - qty) > 0.001) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, `El total empacado (${fmt(packagedQty)}) debe coincidir con el rendimiento real (${fmt(qty)}).`));
  }

  const callRealProductionBatchRpc = supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;

  const { data, error } = await callRealProductionBatchRpc("fogo_create_real_production_batch", {
    p_recipe_card_id: recipeId,
    p_produced_qty: qty,
    p_destination_location_id: isOrderFulfillment ? null : destinationLocationId,
    p_ingredients: ingredients,
    p_packages: isOrderFulfillment ? [] : packages,
    p_outputs: outputs,
    p_notes: notes || null,
  });

  if (error) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, error.message || "No se pudo crear el lote real."));
  }

  const result = data as { batchId?: string | null; batchCode?: string | null } | null;
  const qs = new URLSearchParams();
  qs.set("created", "1");
  qs.set("real", "1");
  if (result?.batchId) qs.set("batch_id", result.batchId);
  if (result?.batchCode) qs.set("batch_code", result.batchCode);
  redirect(`/production-batches?${qs.toString()}`);
}

export default async function NewProductionBatchPage({
  searchParams,
}: {
  searchParams?: Promise<{
    recipe_id?: string;
    qty?: string;
    destination_location_id?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const recipeId = String(sp.recipe_id ?? "").trim();
  const qtyParam = Number(String(sp.qty ?? "").trim());
  const requestedDestinationId = String(sp.destination_location_id ?? "").trim();
  const error = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/production-batches/new",
    permissionCode: "production.recipe_book.view",
  });

  if (!recipeId) {
    return (
      <div className="space-y-6">
        <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-6 shadow-[var(--ui-shadow-1)] md:p-8">
          <div className="text-xs font-semibold uppercase text-[#C2410C]">FOGO producción</div>
          <h1 className="mt-2 ui-h1">Nueva producción</h1>
          <p className="mt-2 max-w-2xl ui-body-muted">
            Selecciona una receta publicada para crear un lote real, registrar consumo real, rendimiento y empaques.
          </p>
        </section>
        <div className="ui-panel">
          <h2 className="ui-h2">Elige una receta</h2>
          <p className="mt-2 ui-body-muted">
            La producción se inicia desde el recetario para mantener el vínculo receta → lote → inventario.
          </p>
          <Link href="/recipe-book" className="mt-4 ui-btn ui-btn--brand">
            Ir al recetario
          </Link>
        </div>
      </div>
    );
  }

  const { data: recipeData } = await supabase
    .from("recipe_cards")
    .select(
      "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,status,recipe_description,products(id,name,sku,unit,stock_unit_code),areas(id,name,kind)"
    )
    .eq("id", recipeId)
    .maybeSingle();
  const recipe = (recipeData as RecipeCardRow | null) ?? null;

  if (!recipe || recipe.status !== "published" || !recipe.site_id || !recipe.area_id) {
    return (
      <div className="ui-panel">
        <h1 className="ui-h1">Receta no disponible</h1>
        <p className="mt-2 ui-body-muted">La receta debe estar publicada y tener sede y área asignadas.</p>
        <Link href="/recipe-book" className="mt-4 ui-btn ui-btn--brand">
          Volver al recetario
        </Link>
      </div>
    );
  }

  const canCreate = await checkPermission(supabase, APP_ID, "production.batches.create", {
    siteId: recipe.site_id,
    areaId: recipe.area_id,
  });

  if (!canCreate) {
    return (
      <div className="ui-panel">
        <h1 className="ui-h1">Sin permiso</h1>
        <p className="mt-2 ui-body-muted">No tienes permiso para crear lotes de esta área.</p>
      </div>
    );
  }

  const recipeArea = one(recipe.areas);
  const recipeAreaKind = String(recipeArea?.kind ?? "").trim();

  const [
    { data: ingredientRowsData, error: ingredientRowsError },
    { data: recipeOutputsData },
    { data: locationsData },
    { data: productSiteSettingData },
    { data: productionRoutesData },
  ] = await Promise.all([
    supabase
      .from("recipes")
      .select("ingredient_product_id,quantity")
      .eq("product_id", recipe.product_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("recipe_outputs")
      .select("id,product_id,output_role,expected_qty,expected_unit,cost_allocation_pct,destination_location_id,products(id,name,sku,unit,stock_unit_code)")
      .eq("recipe_card_id", recipe.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,code,zone,description,location_type")
      .eq("site_id", recipe.site_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("product_site_settings")
      .select("production_location_id")
      .eq("product_id", recipe.product_id)
      .eq("site_id", recipe.site_id)
      .eq("is_active", true)
      .maybeSingle(),
    recipeAreaKind
      ? supabase
          .from("product_site_production_routes")
          .select(
            "id,route_name,external_recipe_id,input_location_id,output_mode,output_location_id,output_position_id,is_default"
          )
          .eq("product_id", recipe.product_id)
          .eq("site_id", recipe.site_id)
          .eq("area_kind", recipeAreaKind)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as ProductionRouteRow[] }),
  ]);

  if (ingredientRowsError) {
    return (
      <div className="ui-panel">
        <h1 className="ui-h1">No se pudieron cargar los ingredientes</h1>
        <p className="mt-2 ui-body-muted">{ingredientRowsError.message}</p>
        <Link href="/recipe-book" className="mt-4 ui-btn ui-btn--brand">
          Volver al recetario
        </Link>
      </div>
    );
  }

  const ingredients = (ingredientRowsData ?? []) as IngredientRow[];
  const recipeOutputs = (recipeOutputsData ?? []) as RecipeOutputRow[];
  const locations = (locationsData ?? []) as LocationRow[];
  const productSiteSetting = productSiteSettingData as ProductSiteSettingRow | null;
  const productionRoutes = (productionRoutesData ?? []) as ProductionRouteRow[];
  const matchingProductionRoutes = productionRoutes.filter((route) => {
    const externalRecipeId = String(route.external_recipe_id ?? "").trim();
    return !externalRecipeId || externalRecipeId === recipe.id;
  });
  const productionRoute =
    matchingProductionRoutes.find((route) => String(route.external_recipe_id ?? "").trim() === recipe.id) ??
    matchingProductionRoutes.find((route) => Boolean(route.is_default)) ??
    matchingProductionRoutes[0] ??
    null;
  const routeOutputMode = normalizeProductionOutputMode(
    String(productionRoute?.output_mode ?? "inventory_stock").trim()
  );
  const isOrderFulfillmentRoute = routeOutputMode === "order_fulfillment";
  const configuredProductionLocationId = String(
    productionRoute?.input_location_id ?? productSiteSetting?.production_location_id ?? ""
  ).trim();
  const configuredProductionLocation = configuredProductionLocationId
    ? locations.find((location) => location.id === configuredProductionLocationId) ?? null
    : null;

  const outputDrafts: ProductionOutputDraft[] = (
    recipeOutputs.length > 0
      ? recipeOutputs
      : [
          {
            id: "",
            product_id: recipe.product_id,
            output_role: "primary" as const,
            expected_qty: recipe.yield_qty,
            expected_unit: recipe.yield_unit,
            cost_allocation_pct: 100,
            destination_location_id: null,
            products: recipe.products,
          },
        ]
  ).map((output) => {
    const product = one(output.products);
    return {
      recipeOutputId: output.id || null,
      productId: output.product_id,
      productName: product?.name ?? "Producto resultante",
      outputRole: output.output_role,
      expectedQty: Number(output.expected_qty ?? recipe.yield_qty),
      expectedUnit: output.expected_unit || recipe.yield_unit || product?.stock_unit_code || product?.unit || "un",
      costAllocationPct: Number(output.cost_allocation_pct ?? 0),
      destinationLocationId: output.destination_location_id || null,
    };
  });
  const configuredOutputLocationId =
    !isOrderFulfillmentRoute && productionRoute?.output_location_id
      ? String(productionRoute.output_location_id).trim()
      : "";
  const configuredOutputLocation = configuredOutputLocationId
    ? locations.find((location) => location.id === configuredOutputLocationId) ?? null
    : null;
  const ingredientIds = Array.from(
    new Set(
      ingredients
        .map((row) => String(row.ingredient_product_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const stockLocationIds = configuredProductionLocationId
    ? [configuredProductionLocationId]
    : locations.map((row) => row.id);

  const [{ data: ingredientProductsData }, { data: stockData }] = await Promise.all([
    ingredientIds.length
      ? supabase
          .from("products")
          .select("id,name,sku,unit,stock_unit_code,cost")
          .in("id", ingredientIds)
      : Promise.resolve({ data: [] as IngredientProductRow[] }),
    ingredientIds.length && stockLocationIds.length
      ? supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("product_id", ingredientIds)
          .in("location_id", stockLocationIds)
      : Promise.resolve({ data: [] as StockRow[] }),
  ]);

  const ingredientProductMap = new Map<string, IngredientProductRow>();
  for (const ingredientProduct of (ingredientProductsData ?? []) as IngredientProductRow[]) {
    ingredientProductMap.set(ingredientProduct.id, ingredientProduct);
  }

  const stockByProduct = new Map<string, number>();
  for (const row of (stockData ?? []) as StockRow[]) {
    stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + Number(row.current_qty ?? 0));
  }

  const product = one(recipe.products);
  const area = recipeArea;
  const producedQty = Number.isFinite(qtyParam) && qtyParam > 0 ? qtyParam : Number(recipe.yield_qty) > 0 ? Number(recipe.yield_qty) : 1;
  const yieldUnit = String(recipe.yield_unit || product?.stock_unit_code || product?.unit || "un").trim();
  const portionSize = Number(recipe.portion_size ?? 0);
  const portionUnit = String(recipe.portion_unit || yieldUnit).trim();
  const fallbackDestinationId =
    (requestedDestinationId && locations.some((loc) => loc.id === requestedDestinationId) ? requestedDestinationId : "") ||
    configuredProductionLocation?.id ||
    locations.find((loc) => loc.location_type === "production")?.id ||
    locations[0]?.id ||
    "";
  const destinationId = isOrderFulfillmentRoute
    ? ""
    : configuredOutputLocation?.id || fallbackDestinationId;
  const destinationLocation = destinationId ? locations.find((location) => location.id === destinationId) ?? null : null;
  const locationOptions: ProductionLocationOption[] = locations.map((location) => ({
    id: location.id,
    label: locationLabel(location),
  }));
  const ingredientDrafts: ProductionIngredientDraft[] = ingredients.map((row) => {
    const ingredient = ingredientProductMap.get(String(row.ingredient_product_id ?? ""));
    return {
      ingredientProductId: row.ingredient_product_id,
      productName: ingredient?.name ?? "Ingrediente sin ficha",
      sku: ingredient?.sku ?? "",
      unitCode: String(ingredient?.stock_unit_code || ingredient?.unit || "un"),
      baseQty: Number(row.quantity ?? 0),
      availableQty: stockByProduct.get(row.ingredient_product_id) ?? 0,
      cost: Number(ingredient?.cost ?? 0),
    };
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-6 shadow-[var(--ui-shadow-1)] md:p-8">
        <div className="text-xs font-semibold uppercase text-[#C2410C]">FOGO producción real</div>
        <h1 className="mt-2 ui-h1">Preparar lote</h1>
        <p className="mt-2 max-w-3xl ui-body-muted">
          {product?.name ?? "Producto"} · {area?.name ?? area?.kind ?? "Área"} · rendimiento esperado {fmt(recipe.yield_qty)} {yieldUnit}
          {portionSize > 0 ? ` · porción estándar ${fmt(portionSize)} ${portionUnit}` : ""}
        </p>
        {error ? <div className="mt-4 ui-alert ui-alert--warn">{error}</div> : null}
      </section>

      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="ui-h2">Ruta operativa</h2>
            <p className="mt-2 ui-body-muted">
              FOGO usará esta ruta para separar el LOC que consume insumos del LOC donde queda lo producido.
            </p>
          </div>
          <span className={productionRoute ? "ui-chip ui-chip--success" : "ui-chip ui-chip--warn"}>
            {productionRoute ? "Ruta configurada" : "Fallback legacy"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="ui-panel-soft">
            <div className="ui-label">Consume insumos desde</div>
            <div className="mt-1 font-semibold">
              {configuredProductionLocation ? locationLabel(configuredProductionLocation) : "Sin LOC de consumo"}
            </div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Qué pasa con lo producido</div>
            <div className="mt-1 font-semibold">{outputModeLabel(routeOutputMode)}</div>
            {productionRoute?.route_name ? (
              <div className="mt-1 text-xs text-[var(--ui-muted)]">{productionRoute.route_name}</div>
            ) : null}
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Salida del terminado</div>
            <div className="mt-1 font-semibold">
              {isOrderFulfillmentRoute
                ? "Pedido POS / no crea stock"
                : destinationLocation
                  ? locationLabel(destinationLocation)
                  : "Sin LOC de salida"}
            </div>
            {!isOrderFulfillmentRoute && productionRoute?.output_position_id ? (
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                Con ubicación interna configurada.
              </div>
            ) : null}
          </div>
        </div>

        {!productionRoute ? (
          <div className="ui-alert ui-alert--warn">
            No hay ruta operativa configurada para este producto, sede y área. Se usará el comportamiento legacy:
            LOC de producción del producto o LOC seleccionado como destino.
          </div>
        ) : null}

        {isOrderFulfillmentRoute ? (
          <div className="ui-alert ui-alert--warn">
            Esta receta está configurada como Pedido POS / entrega directa. Al confirmar, FOGO consumirá ingredientes reales
            desde el LOC de consumo, pero no creará stock terminado ni empaques.
          </div>
        ) : null}
      </section>

      <ProductionBatchRealForm
        action={createBatch}
        recipeId={recipe.id}
        backHref={recipe.id ? `/recipe-book?recipe_id=${encodeURIComponent(recipe.id)}&qty=${encodeURIComponent(String(producedQty))}` : "/recipe-book"}
        destinationLocationId={destinationId}
        destinationLocationLabel={destinationLocation ? locationLabel(destinationLocation) : "Sin LOC destino"}
        allowDestinationSelection={!productionRoute && !configuredProductionLocation}
        locations={locationOptions}
        outputMode={routeOutputMode}
        outputModeLabel={outputModeLabel(routeOutputMode)}
        productName={product?.name ?? "Producto"}
        areaLabel={area?.name ?? area?.kind ?? "Área"}
        expectedYieldQty={Number(recipe.yield_qty ?? 0)}
        expectedYieldUnit={yieldUnit}
        portionSize={Number.isFinite(portionSize) ? portionSize : 0}
        portionUnit={portionUnit}
        initialProducedQty={producedQty}
        ingredients={ingredientDrafts}
        outputs={outputDrafts}
        notesPlaceholder="Notas de producción, ajustes, textura, cocción, empaque o incidencias."
      />
    </div>
  );
}
