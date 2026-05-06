import Link from "next/link";
import { redirect } from "next/navigation";

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
  status: string;
  recipe_description: string | null;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientRow = {
  ingredient_product_id: string;
  quantity: number | null;
  products?: Relation<ProductShape & { cost: number | null }>;
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

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value))}`;
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
    redirect(buildReturn(recipeId, Number.isFinite(qty) ? qty : 0, destinationLocationId, "Completa receta, cantidad y LOC destino."));
  }

  const { data, error } = await supabase.rpc("fogo_create_production_batch_from_recipe", {
    p_recipe_card_id: recipeId,
    p_produced_qty: qty,
    p_destination_location_id: destinationLocationId,
    p_notes: notes || null,
  });

  if (error) {
    redirect(buildReturn(recipeId, qty, destinationLocationId, error.message || "No se pudo crear el lote."));
  }

  const result = data as { batchId?: string | null } | null;
  const qs = new URLSearchParams();
  qs.set("created", "1");
  if (result?.batchId) qs.set("batch_id", result.batchId);
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
  const qty = Number(String(sp.qty ?? "").trim());
  const producedQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const requestedDestinationId = String(sp.destination_location_id ?? "").trim();
  const error = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/production-batches/new",
    permissionCode: "production.recipe_book.view",
  });

  if (!recipeId) {
    return (
      <div className="ui-panel">
        <h1 className="ui-h1">Preparar produccion</h1>
        <p className="mt-2 ui-body-muted">Selecciona una receta desde el recetario para crear un lote.</p>
        <Link href="/recipe-book" className="mt-4 ui-btn ui-btn--brand">
          Ir al recetario
        </Link>
      </div>
    );
  }

  const { data: recipeData } = await supabase
    .from("recipe_cards")
    .select(
      "id,product_id,site_id,area_id,yield_qty,yield_unit,status,recipe_description,products(id,name,sku,unit,stock_unit_code),areas(id,name,kind)"
    )
    .eq("id", recipeId)
    .maybeSingle();
  const recipe = (recipeData as RecipeCardRow | null) ?? null;

  if (!recipe || recipe.status !== "published" || !recipe.site_id || !recipe.area_id) {
    return (
      <div className="ui-panel">
        <h1 className="ui-h1">Receta no disponible</h1>
        <p className="mt-2 ui-body-muted">La receta debe estar publicada y tener sede y area asignadas.</p>
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
        <p className="mt-2 ui-body-muted">No tienes permiso para crear lotes de esta area.</p>
      </div>
    );
  }

  const [{ data: ingredientRows }, { data: locationsData }] = await Promise.all([
    supabase
      .from("recipes")
      .select("ingredient_product_id,quantity,products(id,name,sku,unit,stock_unit_code,cost)")
      .eq("product_id", recipe.product_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,code,zone,description,location_type")
      .eq("site_id", recipe.site_id)
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  const ingredients = (ingredientRows ?? []) as IngredientRow[];
  const locations = (locationsData ?? []) as LocationRow[];
  const ingredientIds = ingredients.map((row) => row.ingredient_product_id);
  const locationIds = locations.map((row) => row.id);

  const { data: stockData } =
    ingredientIds.length && locationIds.length
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("product_id", ingredientIds)
          .in("location_id", locationIds)
      : { data: [] as StockRow[] };

  const stockByProduct = new Map<string, number>();
  for (const row of (stockData ?? []) as StockRow[]) {
    stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + Number(row.current_qty ?? 0));
  }

  const product = one(recipe.products);
  const area = one(recipe.areas);
  const scale = Number(recipe.yield_qty) > 0 ? producedQty / Number(recipe.yield_qty) : 1;
  const totalCost = ingredients.reduce((acc, row) => {
    const ingredient = one(row.products);
    return acc + Number(row.quantity ?? 0) * scale * Number(ingredient?.cost ?? 0);
  }, 0);
  const destinationId =
    (requestedDestinationId && locations.some((loc) => loc.id === requestedDestinationId) ? requestedDestinationId : "") ||
    locations.find((loc) => loc.location_type === "production")?.id ||
    locations[0]?.id ||
    "";

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-6 shadow-[var(--ui-shadow-1)] md:p-8">
        <div className="text-xs font-semibold uppercase text-[#C2410C]">FOGO produccion</div>
        <h1 className="mt-2 ui-h1">Preparar lote</h1>
        <p className="mt-2 max-w-2xl ui-body-muted">
          {product?.name ?? "Producto"} · {area?.name ?? area?.kind ?? "Area"} · rendimiento base {fmt(recipe.yield_qty)} {recipe.yield_unit}
        </p>
        {error ? <div className="mt-4 ui-alert ui-alert--warn">{error}</div> : null}
      </section>

      <form action={createBatch} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <input type="hidden" name="recipe_id" value={recipe.id} />

        <section className="space-y-6">
          <div className="ui-panel">
            <h2 className="ui-h2">Ingredientes a consumir</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ingredients.map((row, index) => {
                const ingredient = one(row.products);
                const required = Number(row.quantity ?? 0) * scale;
                const available = stockByProduct.get(row.ingredient_product_id) ?? 0;
                const unit = ingredient?.stock_unit_code || ingredient?.unit || "-";
                const ok = available + 0.000001 >= required;
                return (
                  <div key={row.ingredient_product_id} className="rounded-lg border border-[var(--ui-border)] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase text-[#C2410C]">Ingrediente {index + 1}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-[var(--ui-text)]">
                          {ingredient?.name ?? "Ingrediente"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">{ingredient?.sku ?? "-"}</div>
                      </div>
                      <span className={`ui-chip ${ok ? "ui-chip--success" : "ui-chip--warn"}`}>
                        {ok ? "OK" : "Falta"}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <div className="ui-label">Requerido</div>
                        <div className="mt-1 text-xl font-semibold">{fmt(required)} {unit}</div>
                      </div>
                      <div>
                        <div className="ui-label">Disponible</div>
                        <div className="mt-1 text-xl font-semibold">{fmt(available)} {unit}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {ingredients.length === 0 ? (
                <div className="ui-empty md:col-span-2">La receta no tiene ingredientes activos.</div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="ui-panel h-fit space-y-4">
          <h2 className="ui-h2">Confirmacion</h2>
          <label className="block">
            <span className="ui-label">Cantidad producida ({recipe.yield_unit})</span>
            <input className="ui-input mt-1" type="number" min="0.01" step="0.01" name="qty" defaultValue={producedQty} required />
          </label>
          <label className="block">
            <span className="ui-label">LOC destino del terminado</span>
            <select className="ui-input mt-1" name="destination_location_id" defaultValue={destinationId} required>
              <option value="">Selecciona LOC</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {locationLabel(location)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="ui-label">Notas</span>
            <textarea className="ui-input mt-1 min-h-[104px] py-3" name="notes" placeholder="Opcional" />
          </label>
          <div className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
            <div className="ui-label">Costo estimado</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{money(totalCost)}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Unitario aprox. {money(producedQty > 0 ? totalCost / producedQty : null)}
            </div>
          </div>
          <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={!destinationId || ingredients.length === 0}>
            Crear lote y consumir inventario
          </button>
          <Link href={recipe.id ? `/recipe-book?recipe_id=${encodeURIComponent(recipe.id)}&qty=${encodeURIComponent(String(producedQty))}` : "/recipe-book"} className="ui-btn ui-btn--ghost w-full">
            Volver
          </Link>
        </aside>
      </form>
    </div>
  );
}
