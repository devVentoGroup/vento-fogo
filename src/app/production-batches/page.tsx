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
  expected_qty: number | null;
  expected_unit: string | null;
  packaged_qty: number | null;
  packaged_unit: string | null;
  package_count: number | null;
  packaging_status: string | null;
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
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(
    Number(value)
  );
}

function statusLabel(value: string | null | undefined) {
  const status = String(value ?? "").trim();
  switch (status) {
    case "posted":
      return "Publicado";
    case "draft":
      return "Borrador";
    case "cancelled":
      return "Cancelado";
    case "completed":
      return "Completado";
    default:
      return status || "Publicado";
  }
}

function packageStatusLabel(value: string | null | undefined) {
  const status = String(value ?? "").trim();
  switch (status) {
    case "packaged":
      return "Empacado";
    case "pending":
      return "Pendiente";
    case "not_required":
      return "No requerido";
    default:
      return status || "Sin empaque";
  }
}

function packageStatusClassName(value: string | null | undefined) {
  const status = String(value ?? "").trim();
  if (status === "packaged") return "ui-chip ui-chip--success";
  if (status === "pending") return "ui-chip ui-chip--warn";
  return "ui-chip";
}

function batchYieldDelta(batch: BatchRow) {
  const expected = Number(batch.expected_qty ?? 0);
  const produced = Number(batch.produced_qty ?? 0);

  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(produced)) {
    return null;
  }

  const diff = produced - expected;
  const pct = (diff / expected) * 100;

  return {
    diff,
    pct,
    isPositive: diff > 0,
    isNegative: diff < 0,
  };
}

export default async function ProductionBatchesPage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string; created?: string; batch_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();
  const created = String(sp.created ?? "").trim() === "1";
  const createdBatchId = String(sp.batch_id ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/production-batches",
    permissionCode: "production.batches.view",
  });

  let batchQuery = supabase
    .from("production_batches")
    .select(
      [
        "id",
        "site_id",
        "product_id",
        "produced_qty",
        "produced_unit",
        "expected_qty",
        "expected_unit",
        "packaged_qty",
        "packaged_unit",
        "package_count",
        "packaging_status",
        "total_cost",
        "unit_cost",
        "status",
        "notes",
        "created_at",
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .limit(80);

  if (siteId) {
    batchQuery = batchQuery.eq("site_id", siteId);
  }

  const { data: batchesData } = await batchQuery;
  const batches = ((batchesData ?? []) as unknown as BatchRow[]);

  const productIds = Array.from(new Set(batches.map((batch) => batch.product_id)));
  const siteIds = Array.from(new Set(batches.map((batch) => batch.site_id)));
  const batchIds = batches.map((batch) => batch.id);

  const [{ data: productsData }, { data: sitesData }, { data: consumptionsData }] =
    await Promise.all([
      productIds.length
        ? supabase.from("products").select("id,name,sku").in("id", productIds)
        : Promise.resolve({ data: [] }),
      siteIds.length
        ? supabase.from("sites").select("id,name").in("id", siteIds)
        : Promise.resolve({ data: [] }),
      batchIds.length
        ? supabase
            .from("production_batch_consumptions")
            .select("batch_id,consumed_qty")
            .in("batch_id", batchIds)
        : Promise.resolve({ data: [] }),
    ]);

  const products = new Map<string, ProductRow>(
    ((productsData ?? []) as unknown as ProductRow[]).map((row) => [row.id, row])
  );
  const sites = new Map<string, SiteRow>(
    ((sitesData ?? []) as unknown as SiteRow[]).map((row) => [row.id, row])
  );

  const consumptionByBatch = new Map<string, { lines: number; qty: number }>();
  for (const row of ((consumptionsData ?? []) as unknown as Array<{
    batch_id: string;
    consumed_qty: number | null;
  }>)) {
    const current = consumptionByBatch.get(row.batch_id) ?? { lines: 0, qty: 0 };
    current.lines += 1;
    current.qty += Number(row.consumed_qty ?? 0);
    consumptionByBatch.set(row.batch_id, current);
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentBatches = batches.filter((batch) => new Date(batch.created_at) >= sevenDaysAgo);
  const totalProducedRecent = recentBatches.reduce(
    (acc, row) => acc + Number(row.produced_qty ?? 0),
    0
  );
  const totalCostRecent = recentBatches.reduce(
    (acc, row) => acc + Number(row.total_cost ?? 0),
    0
  );
  const totalPackagesRecent = recentBatches.reduce(
    (acc, row) => acc + Number(row.package_count ?? 0),
    0
  );
  const packagedBatchesRecent = recentBatches.filter(
    (row) => String(row.packaging_status ?? "").trim() === "packaged"
  ).length;

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-[#C2410C]">
              FOGO producción
            </div>
            <h1 className="mt-2 ui-h1">Lotes de producción</h1>
            <p className="mt-2 max-w-2xl ui-body-muted">
              Ejecuta recetas, registra consumo real, rendimiento real y empaques del lote.
              La producción terminada queda disponible para NEXO.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
            <Link href="/production-batches/new" className="ui-btn ui-btn--brand">
              Nueva producción
            </Link>
            <Link href="/recipe-book" className="ui-btn ui-btn--ghost">
              Ver recetario
            </Link>
          </div>
        </div>

        {created ? (
          <div className="mt-4 ui-alert ui-alert--success">
            Producción registrada correctamente.
            {createdBatchId ? (
              <>
                {" "}
                Lote: <strong>{createdBatchId.slice(0, 8)}</strong>.
              </>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="ui-panel-soft">
            <div className="ui-label">Lotes (7 días)</div>
            <div className="mt-1 ui-h2">{recentBatches.length}</div>
          </div>

          <div className="ui-panel-soft">
            <div className="ui-label">Cantidad producida (7 días)</div>
            <div className="mt-1 ui-h2">{fmt(totalProducedRecent)}</div>
          </div>

          <div className="ui-panel-soft">
            <div className="ui-label">Empaques generados (7 días)</div>
            <div className="mt-1 ui-h2">{fmt(totalPackagesRecent, 0)}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              {packagedBatchesRecent} lote(s) empacado(s)
            </div>
          </div>

          <div className="ui-panel-soft">
            <div className="ui-label">Costo total (7 días)</div>
            <div className="mt-1 ui-h2">${fmt(totalCostRecent, 0)}</div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="ui-h2">Últimos lotes</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Seguimiento de producción real, empaques y consumo registrado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/production-batches/new" className="ui-btn ui-btn--brand ui-btn--sm">
              Nueva producción
            </Link>
            <Link href="/recipe-book" className="ui-btn ui-btn--ghost ui-btn--sm">
              Recetario
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[1180px]">
            <thead>
              <tr>
                <th className="ui-th">Fecha</th>
                <th className="ui-th">Producto</th>
                <th className="ui-th">SKU</th>
                <th className="ui-th">Sede</th>
                <th className="ui-th">Rendimiento</th>
                <th className="ui-th">Empaque</th>
                <th className="ui-th">Consumo real</th>
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
                const delta = batchYieldDelta(row);
                const producedUnit = row.produced_unit || row.expected_unit || "-";
                const packagedQty = Number(row.packaged_qty ?? 0);
                const packageCount = Number(row.package_count ?? 0);

                return (
                  <tr key={row.id}>
                    <td className="ui-td">{asDate(row.created_at)}</td>
                    <td className="ui-td">
                      <div className="font-medium text-[var(--ui-text)]">
                        {product?.name ?? "Producto"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Lote {row.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="ui-td">{product?.sku ?? "-"}</td>
                    <td className="ui-td">{site?.name ?? row.site_id}</td>
                    <td className="ui-td">
                      <div className="font-medium text-[var(--ui-text)]">
                        Real: {fmt(row.produced_qty)} {producedUnit}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Esperado: {fmt(row.expected_qty)} {row.expected_unit ?? producedUnit}
                      </div>
                      {delta ? (
                        <div
                          className={`mt-1 text-xs font-semibold ${
                            delta.isPositive
                              ? "text-emerald-700"
                              : delta.isNegative
                                ? "text-amber-700"
                                : "text-[var(--ui-muted)]"
                          }`}
                        >
                          {delta.diff > 0 ? "+" : ""}
                          {fmt(delta.diff)} {producedUnit} · {delta.pct > 0 ? "+" : ""}
                          {fmt(delta.pct, 1)}%
                        </div>
                      ) : null}
                    </td>
                    <td className="ui-td">
                      <div>
                        <span className={packageStatusClassName(row.packaging_status)}>
                          {packageStatusLabel(row.packaging_status)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-[var(--ui-muted)]">
                        {packageCount > 0
                          ? `${fmt(packageCount, 0)} empaque(s)`
                          : "Sin empaques"}
                        {packagedQty > 0 ? (
                          <>
                            {" "}
                            · {fmt(packagedQty)} {row.packaged_unit ?? producedUnit}
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="ui-td">
                      {consumption.lines} línea(s) / {fmt(consumption.qty)}
                    </td>
                    <td className="ui-td">${fmt(row.total_cost, 0)}</td>
                    <td className="ui-td">${fmt(row.unit_cost, 2)}</td>
                    <td className="ui-td">
                      <span className="ui-chip">{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                );
              })}

              {batches.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={10}>
                    No hay lotes registrados para la sede activa.
                    <div className="mt-3">
                      <Link href="/production-batches/new" className="ui-btn ui-btn--brand">
                        Crear primera producción
                      </Link>
                    </div>
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
