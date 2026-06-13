"use client";

import { useMemo, useState } from "react";

export type RecipeOutputLine = {
  id?: string;
  product_id: string;
  output_role: "primary" | "co_product" | "by_product";
  expected_qty: number;
  expected_unit: string;
  cost_allocation_pct: number;
  sort_order?: number;
  _delete?: boolean;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  product_type?: string | null;
};

type Props = {
  name?: string;
  primaryProductId: string;
  primaryProductName: string;
  primaryUnit: string;
  yieldQty: number;
  products: ProductOption[];
  initialRows?: RecipeOutputLine[];
};

function newLine(primaryUnit: string): RecipeOutputLine {
  return {
    product_id: "",
    output_role: "co_product",
    expected_qty: 1,
    expected_unit: primaryUnit || "un",
    cost_allocation_pct: 0,
  };
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function RecipeOutputsEditor({
  name = "recipe_outputs",
  primaryProductId,
  primaryProductName,
  primaryUnit,
  yieldQty,
  products,
  initialRows = [],
}: Props) {
  const eligibleProducts = products.filter((product) => {
    const type = String(product.product_type ?? "").trim().toLowerCase();
    return product.id !== primaryProductId && (!type || type === "preparacion" || type === "venta");
  });
  const [rows, setRows] = useState<RecipeOutputLine[]>(initialRows);
  const visibleRows = rows.filter((row) => !row._delete);
  const primaryPct = Math.max(
    0,
    100 - visibleRows.reduce((total, row) => total + numberValue(row.cost_allocation_pct), 0),
  );
  const payload = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        expected_qty: numberValue(row.expected_qty),
        cost_allocation_pct: numberValue(row.cost_allocation_pct),
        sort_order: index + 2,
      })),
    [rows],
  );

  const updateRow = (index: number, patch: Partial<RecipeOutputLine>) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const row = current[index];
      if (row?.id) {
        return current.map((entry, rowIndex) => (rowIndex === index ? { ...entry, _delete: true } : entry));
      }
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  return (
    <section className="ui-panel space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ui-h2">Productos resultantes del lote</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ui-muted)]">
            Agrega coproductos o subproductos que salen de la misma producción. Los ingredientes se consumen una sola vez y el costo se reparte por porcentaje.
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setRows((current) => [...current, newLine(primaryUnit)])}>
          + Agregar subproducto
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[var(--ui-text)]">{primaryProductName || "Producto principal"}</div>
            <div className="text-xs font-semibold text-[var(--ui-muted)]">
              Producto principal · {numberValue(yieldQty, 1)} {primaryUnit || "un"}
            </div>
          </div>
          <span className="ui-chip ui-chip--brand">{primaryPct.toFixed(2)}% costo</span>
        </div>
      </div>

      {visibleRows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            if (row._delete) return null;
            return (
              <div key={row.id ?? `new-${index}`} className="grid gap-3 rounded-2xl border border-[var(--ui-border)] bg-white p-4 md:grid-cols-[minmax(220px,1.4fr)_150px_130px_110px_90px] md:items-end">
                <label className="space-y-1">
                  <span className="ui-label">Producto resultante</span>
                  <select
                    className="ui-input"
                    value={row.product_id}
                    onChange={(event) => updateRow(index, { product_id: event.target.value })}
                  >
                    <option value="">Selecciona producto</option>
                    {eligibleProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {[product.name, product.sku ? `SKU ${product.sku}` : null].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                  </select>
                  <span className="block text-xs text-[var(--ui-muted)]">
                    Solo preparaciones o preparaciones vendibles pueden salir como subproducto.
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="ui-label">Rol</span>
                  <select
                    className="ui-input"
                    value={row.output_role}
                    onChange={(event) => updateRow(index, { output_role: event.target.value as RecipeOutputLine["output_role"] })}
                  >
                    <option value="co_product">Coproducto</option>
                    <option value="by_product">Subproducto</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="ui-label">Cantidad</span>
                  <input
                    className="ui-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={row.expected_qty}
                    onChange={(event) => updateRow(index, { expected_qty: numberValue(event.target.value) })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="ui-label">Unidad</span>
                  <input
                    className="ui-input"
                    value={row.expected_unit}
                    onChange={(event) => updateRow(index, { expected_unit: event.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="ui-label">% costo</span>
                  <input
                    className="ui-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.cost_allocation_pct}
                    onChange={(event) => updateRow(index, { cost_allocation_pct: numberValue(event.target.value) })}
                  />
                </label>
                <div className="md:col-span-5">
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => removeRow(index)}>
                    Quitar subproducto
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ui-empty">Sin subproductos. Esta receta se comporta como producción de un solo producto.</div>
      )}
    </section>
  );
}
