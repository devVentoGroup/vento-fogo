"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SupplierOption = { id: string; name: string };
type SiteOption = { id: string; name?: string | null };
type ProductOption = { id: string; name: string; sku?: string | null };
type LineItemValue = {
  product_id?: string;
  quantity?: number | null;
  unit_cost?: number | null;
  unit?: string | null;
};

type PurchaseOrderGuidedFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  suppliers: SupplierOption[];
  sites: SiteOption[];
  products: ProductOption[];
  maxLines?: number;
  defaultValues?: {
    supplier_id?: string;
    site_id?: string;
    expected_at?: string;
    notes?: string | null;
    lines?: LineItemValue[];
  };
};

type Step = { id: string; title: string; objective: string };

const STEPS: Step[] = [
  { id: "cabecera", title: "Cabecera", objective: "Define proveedor, sede y fecha esperada." },
  { id: "lineas", title: "Lineas", objective: "Agrega productos, cantidades y costo unitario." },
  { id: "resumen", title: "Resumen", objective: "Valida datos y confirma guardado." },
];

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toNum(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function PurchaseOrderGuidedForm({
  mode,
  action,
  cancelHref,
  suppliers,
  sites,
  products,
  maxLines = 15,
  defaultValues,
}: PurchaseOrderGuidedFormProps) {
  const [stepId, setStepId] = useState(STEPS[0].id);
  const [supplierId, setSupplierId] = useState(toStr(defaultValues?.supplier_id));
  const [siteId, setSiteId] = useState(toStr(defaultValues?.site_id));
  const [expectedAt, setExpectedAt] = useState(toStr(defaultValues?.expected_at));
  const [notes, setNotes] = useState(toStr(defaultValues?.notes));
  const [lineRows, setLineRows] = useState(() => {
    const base = Array.from({ length: maxLines }, () => ({
      product_id: "",
      quantity: "",
      unit_cost: "",
      unit: "",
    }));
    const incoming = defaultValues?.lines ?? [];
    for (let i = 0; i < Math.min(incoming.length, maxLines); i += 1) {
      const line = incoming[i];
      base[i] = {
        product_id: toStr(line.product_id),
        quantity: line.quantity == null ? "" : String(line.quantity),
        unit_cost: line.unit_cost == null ? "" : String(line.unit_cost),
        unit: toStr(line.unit),
      };
    }
    return base;
  });

  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.id === stepId));
  const progress = STEPS.length > 1 ? ((currentIndex + 1) / STEPS.length) * 100 : 100;
  const atFirstStep = currentIndex === 0;
  const atLastStep = currentIndex === STEPS.length - 1;

  const isHeaderComplete = Boolean(supplierId) && Boolean(siteId);
  const validLineCount = useMemo(
    () =>
      lineRows.filter((line) => {
        const q = toNum(line.quantity);
        return Boolean(line.product_id) && q != null && q > 0;
      }).length,
    [lineRows]
  );
  const canSubmit = isHeaderComplete;

  const summaryTotal = useMemo(
    () =>
      lineRows.reduce((acc, line) => {
        const q = toNum(line.quantity);
        const c = toNum(line.unit_cost) ?? 0;
        if (!line.product_id || q == null || q <= 0) return acc;
        return acc + q * c;
      }, 0),
    [lineRows]
  );

  const moveStep = (delta: -1 | 1) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, currentIndex + delta));
    setStepId(STEPS[next].id);
  };

  const updateLine = (index: number, field: "product_id" | "quantity" | "unit_cost" | "unit", value: string) => {
    setLineRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="expected_at" value={expectedAt} />
      <input type="hidden" name="notes" value={notes} />
      {lineRows.map((row, index) => (
        <div key={`line-hidden-${index}`}>
          <input type="hidden" name={`item_${index}_product_id`} value={row.product_id} />
          <input type="hidden" name={`item_${index}_quantity`} value={row.quantity} />
          <input type="hidden" name={`item_${index}_unit_cost`} value={row.unit_cost} />
          <input type="hidden" name={`item_${index}_unit`} value={row.unit} />
        </div>
      ))}

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="ui-caption">Paso {currentIndex + 1} de {STEPS.length}</div>
          <div className="ui-caption">{Math.round(progress)}%</div>
        </div>
        <div className="h-2 rounded-full bg-zinc-200">
          <div className="h-2 rounded-full bg-[var(--ui-brand)] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STEPS.map((step, index) => {
            const status =
              index === currentIndex ? "current" : index < currentIndex ? "complete" : "pending";
            const cls =
              status === "current"
                ? "border-[var(--ui-brand)] bg-[var(--ui-brand)]/10 text-[var(--ui-brand-700)]"
                : status === "complete"
                  ? "border-[var(--ui-success)] bg-[var(--ui-success)]/10 text-[var(--ui-success)]"
                  : "border-[var(--ui-border)] bg-white text-[var(--ui-muted)]";
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepId(step.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors hover:border-[var(--ui-brand)] ${cls}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">Paso {index + 1}</div>
                <div className="text-sm font-semibold">{step.title}</div>
              </button>
            );
          })}
        </div>
        <div className="rounded-lg border border-[var(--ui-border)] bg-white p-3">
          <div className="text-sm font-semibold">{STEPS[currentIndex].title}</div>
          <div className="ui-caption mt-1">{STEPS[currentIndex].objective}</div>
        </div>
      </section>

      <section className={stepId === "cabecera" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 1. Cabecera</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="ui-label">Proveedor *</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="ui-input mt-1"
              required
            >
              <option value="">Seleccionar...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="ui-label">Sede *</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="ui-input mt-1"
              required
            >
              <option value="">Seleccionar...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="ui-label">Fecha esperada</span>
            <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="ui-input mt-1" />
          </label>
          <label className="sm:col-span-2">
            <span className="ui-label">Notas</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[var(--ui-text)] placeholder:text-[var(--ui-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
              placeholder="Referencia, observaciones..."
            />
          </label>
        </div>
        <div className="ui-panel-soft space-y-1 p-3">
          <div className="ui-caption"><strong>Que significa:</strong> Define proveedor y sede de la orden.</div>
          <div className="ui-caption"><strong>Cuando usarlo:</strong> Siempre antes de agregar lineas.</div>
          <div className="ui-caption"><strong>Ejemplo:</strong> Proveedor: Alimentos XYZ; Sede: Vento Group.</div>
        </div>
      </section>

      <section className={stepId === "lineas" ? "ui-panel space-y-4" : "hidden"}>
        <div className="flex items-center justify-between gap-2">
          <div className="ui-h3">Paso 2. Lineas</div>
          <div className="ui-caption">{validLineCount} linea(s) validas</div>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table min-w-full">
            <thead>
              <tr>
                <th className="ui-th text-left">Producto</th>
                <th className="ui-th text-right">Cantidad</th>
                <th className="ui-th text-right">Costo unit.</th>
                <th className="ui-th text-left">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line, i) => (
                <tr key={`line-${i}`}>
                  <td className="ui-td">
                    <select
                      value={line.product_id}
                      onChange={(e) => updateLine(i, "product_id", e.target.value)}
                      className="h-11 w-full min-w-[220px] rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                    >
                      <option value="">--</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku ? `${p.sku} - ` : ""}{p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, "quantity", e.target.value)}
                      className="h-11 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-right text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                      placeholder="0"
                    />
                  </td>
                  <td className="ui-td text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(i, "unit_cost", e.target.value)}
                      className="h-11 w-full rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-right text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                      placeholder="0"
                    />
                  </td>
                  <td className="ui-td">
                    <input
                      value={line.unit}
                      onChange={(e) => updateLine(i, "unit", e.target.value)}
                      className="h-11 w-20 rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-brand)]/30"
                      placeholder="u"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ui-panel-soft space-y-1 p-3">
          <div className="ui-caption"><strong>Que significa:</strong> Cada linea representa un item de compra.</div>
          <div className="ui-caption"><strong>Cuando usarlo:</strong> Cantidad mayor a 0 para que la linea se guarde.</div>
          <div className="ui-caption"><strong>Ejemplo:</strong> Harina x 10, costo 5200, unidad kg.</div>
        </div>
      </section>

      <section className={stepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
        <div className="ui-h3">Paso 3. Resumen y validacion</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Proveedor</div>
            <div className="font-semibold">{suppliers.find((s) => s.id === supplierId)?.name ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede</div>
            <div className="font-semibold">{sites.find((s) => s.id === siteId)?.name ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Lineas validas</div>
            <div className="font-semibold">{validLineCount}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Total estimado</div>
            <div className="font-semibold">{summaryTotal.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        {!canSubmit ? (
          <div className="ui-alert ui-alert--warn">
            Completa proveedor y sede para poder guardar.
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!atFirstStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(-1)}>
              Anterior
            </button>
          ) : null}
          {!atLastStep ? (
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(1)}>
              Siguiente
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
            {mode === "edit" ? "Guardar cambios" : "Crear orden (borrador)"}
          </button>
          <Link href={cancelHref} className="ui-btn ui-btn--ghost">
            Cancelar
          </Link>
        </div>
      </div>
    </form>
  );
}
