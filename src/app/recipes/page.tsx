import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const NEXO_BASE_URL = process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") || "https://nexo.ventogroup.co";

type ProductShape = { name: string | null; sku: string | null; unit: string | null };

type RecipeCardRow = {
  id: string;
  product_id: string;
  yield_qty: number;
  yield_unit: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
  products?: ProductShape | ProductShape[] | null;
};

function asDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function qty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(Number(value));
}

function resolveProduct(value: ProductShape | ProductShape[] | null | undefined): ProductShape | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipes",
    permissionCode: "production.recipes",
  });

  let query = supabase
    .from("recipe_cards")
    .select("id,product_id,yield_qty,yield_unit,status,updated_at,products(name,sku,unit)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data: recipeCardsData } = await query;
  const recipeCards = ((recipeCardsData ?? []) as unknown[]) as RecipeCardRow[];

  const productIds = Array.from(new Set(recipeCards.map((r) => r.product_id)));
  const recipeCardIds = recipeCards.map((r) => r.id);

  const [{ data: ingredientRows }, { data: stepRows }] = await Promise.all([
    productIds.length
      ? supabase
          .from("recipes")
          .select("product_id,quantity")
          .in("product_id", productIds)
          .eq("is_active", true)
      : Promise.resolve({ data: [] }),
    recipeCardIds.length
      ? supabase.from("recipe_steps").select("recipe_card_id").in("recipe_card_id", recipeCardIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ingredientByProduct = new Map<string, { lines: number; qty: number }>();
  for (const row of (ingredientRows ?? []) as Array<{ product_id: string; quantity: number | null }>) {
    const current = ingredientByProduct.get(row.product_id) ?? { lines: 0, qty: 0 };
    current.lines += 1;
    current.qty += Number(row.quantity ?? 0);
    ingredientByProduct.set(row.product_id, current);
  }

  const stepsByCard = new Map<string, number>();
  for (const row of (stepRows ?? []) as Array<{ recipe_card_id: string }>) {
    stepsByCard.set(row.recipe_card_id, (stepsByCard.get(row.recipe_card_id) ?? 0) + 1);
  }

  const published = recipeCards.filter((r) => r.status === "published").length;
  const draft = recipeCards.filter((r) => r.status === "draft").length;

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">Recetas</h1>
        <p className="mt-2 ui-body-muted">
          Recetario operativo (BOM + pasos). Aqui puedes auditar estado, ingredientes y pasos por producto.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="ui-panel-soft">
            <div className="ui-label">Total recetas</div>
            <div className="mt-1 ui-h2">{recipeCards.length}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Publicadas</div>
            <div className="mt-1 ui-h2">{published}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Borrador</div>
            <div className="mt-1 ui-h2">{draft}</div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="ui-h2">Listado de recetas</h2>
          <a
            href={`${NEXO_BASE_URL}/inventory/catalog`}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            target="_blank"
            rel="noreferrer"
          >
            Abrir catalogo en NEXO
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[920px]">
            <thead>
              <tr>
                <th className="ui-th">Producto</th>
                <th className="ui-th">SKU</th>
                <th className="ui-th">Rendimiento</th>
                <th className="ui-th">Ingredientes</th>
                <th className="ui-th">Pasos</th>
                <th className="ui-th">Estado</th>
                <th className="ui-th">Actualizado</th>
                <th className="ui-th">Accion</th>
              </tr>
            </thead>
            <tbody>
              {recipeCards.map((row) => {
                const ingredient = ingredientByProduct.get(row.product_id) ?? { lines: 0, qty: 0 };
                const steps = stepsByCard.get(row.id) ?? 0;
                const product = resolveProduct(row.products);
                const productName = product?.name || "Producto";
                const sku = product?.sku || "-";
                return (
                  <tr key={row.id}>
                    <td className="ui-td">{productName}</td>
                    <td className="ui-td">{sku}</td>
                    <td className="ui-td">{qty(row.yield_qty)} {row.yield_unit}</td>
                    <td className="ui-td">{ingredient.lines} lineas</td>
                    <td className="ui-td">{steps}</td>
                    <td className="ui-td">
                      <span className={`ui-chip ${row.status === "published" ? "ui-chip--success" : "ui-chip--warn"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="ui-td">{asDate(row.updated_at)}</td>
                    <td className="ui-td">
                      <Link className="ui-btn ui-btn--ghost ui-btn--sm" href="/production-batches">
                        Ver lotes
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {recipeCards.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={8}>
                    No hay recetas para la sede activa.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
