import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import {
  ProductionBatchRealForm,
  type ProductionIngredientDraft,
  type ProductionLocationOption,
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

  if (!recipeId || !destinationLocationId || !Number.isFinite(qty) || qty <= 0) {
    redirect(buildReturn(recipeId, Number.isFinite(qty) ? qty : 0, destinationLocationId, "Completa receta, rendimiento real y LOC destino."));
  }

  const rawIngredients = parseJsonArray<IngredientPayloadRow>(text(formData.get("ingredients_payload")));
  const rawPackages = parseJsonArray<PackagePayloadRow>(text(formData.get("packages_payload")));

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

  if (!ingredients.length) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, "La receta no tiene ingredientes reales para consumir."));
  }

  if (!packages.length) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, "Genera o registra al menos un empaque del lote."));
  }

  const packagedQty = packages.reduce((acc, row) => acc + row.actual_qty, 0);
  if (Math.abs(packagedQty - qty) > 0.001) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, `El total empacado (${fmt(packagedQty)}) debe coincidir con el rendimiento real (${fmt(qty)}).`));
  }

  const callRealProductionBatchRpc = supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;

  const { data, error } = await callRealProductionBatchRpc("fogo_create_real_production_batch", {
    p_recipe_card_id: recipeId,
    p_produced_qty: qty,
    p_destination_location_id: destinationLocationId,
    p_ingredients: ingredients,
    p_packages: packages,
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

  const [
    { data: ingredientRowsData, error: ingredientRowsError },
    { data: locationsData },
    { data: productSiteSettingData },
  ] = await Promise.all([
    supabase
      .from("recipes")
      .select("ingredient_product_id,quantity")
      .eq("product_id", recipe.product_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
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
  const locations = (locationsData ?? []) as LocationRow[];
  const productSiteSetting = productSiteSettingData as ProductSiteSettingRow | null;
  const configuredProductionLocationId = String(productSiteSetting?.production_location_id ?? "").trim();
  const configuredProductionLocation = configuredProductionLocationId
    ? locations.find((location) => location.id === configuredProductionLocationId) ?? null
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
  const area = one(recipe.areas);
  const producedQty = Number.isFinite(qtyParam) && qtyParam > 0 ? qtyParam : Number(recipe.yield_qty) > 0 ? Number(recipe.yield_qty) : 1;
  const yieldUnit = String(recipe.yield_unit || product?.stock_unit_code || product?.unit || "un").trim();
  const portionSize = Number(recipe.portion_size ?? 0);
  const portionUnit = String(recipe.portion_unit || yieldUnit).trim();
  const destinationId =
    (requestedDestinationId && locations.some((loc) => loc.id === requestedDestinationId) ? requestedDestinationId : "") ||
    configuredProductionLocation?.id ||
    locations.find((loc) => loc.location_type === "production")?.id ||
    locations[0]?.id ||
    "";
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

      <ProductionBatchRealForm
        action={createBatch}
        recipeId={recipe.id}
        backHref={recipe.id ? `/recipe-book?recipe_id=${encodeURIComponent(recipe.id)}&qty=${encodeURIComponent(String(producedQty))}` : "/recipe-book"}
        destinationLocationId={destinationId}
        destinationLocationLabel={destinationLocation ? locationLabel(destinationLocation) : "Sin LOC destino"}
        allowDestinationSelection={!configuredProductionLocation}
        locations={locationOptions}
        productName={product?.name ?? "Producto"}
        areaLabel={area?.name ?? area?.kind ?? "Área"}
        expectedYieldQty={Number(recipe.yield_qty ?? 0)}
        expectedYieldUnit={yieldUnit}
        portionSize={Number.isFinite(portionSize) ? portionSize : 0}
        portionUnit={portionUnit}
        initialProducedQty={producedQty}
        ingredients={ingredientDrafts}
        notesPlaceholder="Notas de producción, ajustes, textura, cocción, empaque o incidencias."
      />
    </div>
  );
}
