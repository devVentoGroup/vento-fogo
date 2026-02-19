import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";

type BatchRow = {
  id: string;
  site_id: string;
  product_id: string;
  produced_qty: number;
  produced_unit: string;
  total_cost: number | null;
  unit_cost: number | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type ProductRow = { id: string; name: string | null; sku: string | null };
type SiteRow = { id: string; name: string | null };

function asDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

export default async function ProductionBatchesPage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/production-batches",
    permissionCode: "production.batches",
  });

  let batchQuery = supabase
    .from("production_batches")
    .select("id,site_id,product_id,produced_qty,produced_unit,total_cost,unit_cost,status,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (siteId) {
    batchQuery = batchQuery.eq("site_id", siteId);
  }

  const { data: batchesData } = await batchQuery;
  const batches = (batchesData ?? []) as BatchRow[];

  const productIds = Array.from(new Set(batches.map((b) => b.product_id)));
  const siteIds = Array.from(new Set(batches.map((b) => b.site_id)));
  const batchIds = batches.map((b) => b.id);

  const [{ data: productsData }, { data: sitesData }, { data: consumptionsData }] = await Promise.all([
    productIds.length ? supabase.from("products").select("id,name,sku").in("id", productIds) : Promise.resolve({ data: [] }),
    siteIds.length ? supabase.from("sites").select("id,name").in("id", siteIds) : Promise.resolve({ data: [] }),
    batchIds.length
      ? supabase.from("production_batch_consumptions").select("batch_id,consumed_qty").in("batch_id", batchIds)
      : Promise.resolve({ data: [] }),
  ]);

  const products = new Map<string, ProductRow>(
    ((productsData ?? []) as ProductRow[]).map((row) => [row.id, row])
  );
  const sites = new Map<string, SiteRow>(
    ((sitesData ?? []) as SiteRow[]).map((row) => [row.id, row])
  );

  const consumptionByBatch = new Map<string, { lines: number; qty: number }>();
  for (const row of (consumptionsData ?? []) as Array<{ batch_id: string; consumed_qty: number | null }>) {
    const current = consumptionByBatch.get(row.batch_id) ?? { lines: 0, qty: 0 };
    current.lines += 1;
    current.qty += Number(row.consumed_qty ?? 0);
    consumptionByBatch.set(row.batch_id, current);
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentBatches = batches.filter((b) => new Date(b.created_at) >= sevenDaysAgo);
  const totalProducedRecent = recentBatches.reduce((acc, row) => acc + Number(row.produced_qty ?? 0), 0);
  const totalCostRecent = recentBatches.reduce((acc, row) => acc + Number(row.total_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <h1 className="ui-h1">Lotes de produccion</h1>
        <p className="mt-2 ui-body-muted">
          Ejecucion de lotes con trazabilidad de consumo e ingreso de producto terminado.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="ui-panel-soft">
            <div className="ui-label">Lotes (7 dias)</div>
            <div className="mt-1 ui-h2">{recentBatches.length}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Cantidad producida (7 dias)</div>
            <div className="mt-1 ui-h2">{fmt(totalProducedRecent)}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Costo total (7 dias)</div>
            <div className="mt-1 ui-h2">${fmt(totalCostRecent, 0)}</div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="ui-h2">Ultimos lotes</h2>
          <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm">
            Ver recetas
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[980px]">
            <thead>
              <tr>
                <th className="ui-th">Fecha</th>
                <th className="ui-th">Producto</th>
                <th className="ui-th">SKU</th>
                <th className="ui-th">Sede</th>
                <th className="ui-th">Producido</th>
                <th className="ui-th">Consumo BOM</th>
                <th className="ui-th">Costo total</th>
                <th className="ui-th">Costo unit.</th>
                <th className="ui-th">Estado</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((row) => {
                const product = products.get(row.product_id);
                const site = sites.get(row.site_id);
                const consumption = consumptionByBatch.get(row.id) ?? { lines: 0, qty: 0 };
                return (
                  <tr key={row.id}>
                    <td className="ui-td">{asDate(row.created_at)}</td>
                    <td className="ui-td">{product?.name ?? "Producto"}</td>
                    <td className="ui-td">{product?.sku ?? "-"}</td>
                    <td className="ui-td">{site?.name ?? row.site_id}</td>
                    <td className="ui-td">{fmt(row.produced_qty)} {row.produced_unit}</td>
                    <td className="ui-td">{consumption.lines} lineas / {fmt(consumption.qty)}</td>
                    <td className="ui-td">${fmt(row.total_cost, 0)}</td>
                    <td className="ui-td">${fmt(row.unit_cost, 2)}</td>
                    <td className="ui-td">
                      <span className="ui-chip">{row.status || "posted"}</span>
                    </td>
                  </tr>
                );
              })}
              {batches.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={9}>
                    No hay lotes registrados para la sede activa.
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
