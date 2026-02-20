import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: FormDataEntryValue | null, fallback = 1) {
  const raw = asText(value);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function withError(url: string, message: string) {
  return `${url}${url.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

async function createRecipeCard(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const source = asText(formData.get("source"));
  const productId = asText(formData.get("product_id"));
  const yieldQty = asNumber(formData.get("yield_qty"), 1);
  const yieldUnit = asText(formData.get("yield_unit")) || "un";
  const recipeDescription = asText(formData.get("recipe_description")) || null;

  const returnToBase = siteId ? `/recipes/new?site_id=${encodeURIComponent(siteId)}` : "/recipes/new";
  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: returnToBase,
    permissionCode: "production.recipes",
  });

  if (!productId) {
    redirect(withError(returnToBase, "Selecciona un producto para crear la receta."));
  }

  const { data: product } = await supabase
    .from("products")
    .select("id,name,sku,unit,product_type,is_active")
    .eq("id", productId)
    .maybeSingle();

  const productRow = (product as ProductOption | null) ?? null;
  if (!productRow || !productRow.is_active) {
    redirect(withError(returnToBase, "El producto seleccionado no esta activo."));
  }

  const productType = String(productRow.product_type ?? "").trim().toLowerCase();
  if (!["preparacion", "venta"].includes(productType)) {
    redirect(withError(returnToBase, "Solo se permiten productos de tipo preparacion o venta."));
  }

  const { data: existingCard } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", productId)
    .maybeSingle();

  if (existingCard?.id) {
    const next = new URLSearchParams();
    if (siteId) next.set("site_id", siteId);
    next.set("product_id", productId);
    next.set("source", source || "fogo");
    next.set("error", "Ese producto ya tiene receta creada.");
    redirect(`/recipes?${next.toString()}`);
  }

  const payload: Record<string, unknown> = {
    product_id: productId,
    yield_qty: yieldQty,
    yield_unit: yieldUnit || productRow.unit || "un",
    status: "draft",
    is_active: true,
    recipe_description: recipeDescription,
  };
  if (siteId) payload.site_id = siteId;

  const { error: insertError } = await supabase.from("recipe_cards").insert(payload);
  if (insertError) {
    const msg = insertError.message || "No fue posible crear la receta.";
    redirect(withError(returnToBase, msg));
  }

  const next = new URLSearchParams();
  if (siteId) next.set("site_id", siteId);
  next.set("product_id", productId);
  next.set("created", "1");
  next.set("source", source || "fogo");
  redirect(`/recipes?${next.toString()}`);
}

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string; product_id?: string; source?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();
  const requestedProductId = String(sp.product_id ?? "").trim();
  const source = String(sp.source ?? "").trim().toLowerCase();
  const error = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: siteId ? `/recipes/new?site_id=${encodeURIComponent(siteId)}` : "/recipes/new",
    permissionCode: "production.recipes",
  });

  const [{ data: productsData }, { data: existingRecipeCards }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,unit,product_type,is_active")
      .in("product_type", ["preparacion", "venta"])
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400),
    supabase.from("recipe_cards").select("product_id"),
  ]);

  const existingProductIds = new Set(
    ((existingRecipeCards ?? []) as Array<{ product_id: string }>).map((row) => row.product_id)
  );

  const allProducts = ((productsData ?? []) as ProductOption[]).filter((row) => Boolean(row.id));
  const selectedProduct = allProducts.find((row) => row.id === requestedProductId) ?? null;
  const availableProducts = allProducts.filter((row) => !existingProductIds.has(row.id) || row.id === requestedProductId);

  const defaultUnit = selectedProduct?.unit || "un";

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">Nueva receta</h1>
        <p className="mt-2 ui-body-muted">
          Crea la ficha inicial de receta para una preparacion o producto de venta y continua el armado BOM en FOGO.
        </p>
        {source === "nexo" ? (
          <div className="mt-3 ui-alert ui-alert--info">
            Llegaste desde NEXO. Aqui se crea la receta del producto seleccionado.
          </div>
        ) : null}
        {error ? <div className="mt-3 ui-alert ui-alert--warn">{error}</div> : null}
      </section>

      <form action={createRecipeCard} className="ui-panel space-y-5">
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="source" value={source || "fogo"} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Producto</span>
            <select name="product_id" defaultValue={requestedProductId} className="ui-input" required>
              <option value="">Selecciona un producto</option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name ?? "Producto"} ({product.sku ?? "-"}) - {product.product_type ?? "n/a"}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ui-muted)]">
              Solo se muestran productos activos de tipo preparacion o venta.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Rendimiento base</span>
            <input name="yield_qty" type="number" min="0.001" step="0.001" defaultValue="1" className="ui-input" required />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Unidad rendimiento</span>
            <input name="yield_unit" defaultValue={defaultUnit} className="ui-input" required />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Descripcion inicial (opcional)</span>
            <textarea
              name="recipe_description"
              rows={3}
              className="ui-input"
              placeholder="Ej. Preparacion base para barra y cocina."
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--ui-border)] pt-4">
          <a href={siteId ? `/recipes?site_id=${encodeURIComponent(siteId)}` : "/recipes"} className="ui-btn ui-btn--ghost">
            Cancelar
          </a>
          <button type="submit" className="ui-btn ui-btn--brand">
            Crear receta borrador
          </button>
        </div>
      </form>
    </div>
  );
}
