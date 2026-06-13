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

function productUnit(product: ProductOption | null | undefined, fallback = "") {
  const stockUnit = String(product?.stock_unit_code ?? "").trim();
  if (stockUnit) return stockUnit;

  const unit = String(product?.unit ?? "").trim();
  if (unit) return unit;

  const fallbackUnit = String(fallback ?? "").trim();
  return fallbackUnit || "un";
}

function productLabel(product: ProductOption) {
  return [product.name, product.sku ? `SKU ${product.sku}` : null]
    .filter(Boolean)
    .join(" · ");
}

function roleLabel(role: RecipeOutputLine["output_role"]) {
  if (role === "by_product") return "Subproducto";
  if (role === "co_product") return "Coproducto";
  return "Principal";
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
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const eligibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const type = String(product.product_type ?? "").trim().toLowerCase();
        return (
          product.id !== primaryProductId &&
          (!type || type === "preparacion" || type === "venta")
        );
      }),
    [primaryProductId, products],
  );

  const [rows, setRows] = useState<RecipeOutputLine[]>(initialRows);
  const visibleRows = rows.filter((row) => !row._delete);
  const secondaryPct = visibleRows.reduce(
    (total, row) => total + numberValue(row.cost_allocation_pct),
    0,
  );
  const primaryPct = Math.max(0, 100 - secondaryPct);
  const costIsOverAssigned = secondaryPct > 100.000001;

  const payload = useMemo(
    () =>
      rows.map((row, index) => {
        const selectedProduct = productById.get(row.product_id);
        const resolvedUnit = productUnit(
          selectedProduct,
          row.expected_unit || primaryUnit || "un",
        );

        return {
          ...row,
          expected_qty: numberValue(row.expected_qty),
          expected_unit: resolvedUnit,
          cost_allocation_pct: numberValue(row.cost_allocation_pct),
          sort_order: index + 2,
        };
      }),
    [primaryUnit, productById, rows],
  );

  const updateRow = (index: number, patch: Partial<RecipeOutputLine>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const changeProduct = (index: number, productId: string) => {
    const selectedProduct = productById.get(productId);
    updateRow(index, {
      product_id: productId,
      expected_unit: productUnit(selectedProduct, primaryUnit || "un"),
    });
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const row = current[index];
      if (row?.id) {
        return current.map((entry, rowIndex) =>
          rowIndex === index ? { ...entry, _delete: true } : entry,
        );
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
            Agrega coproductos o subproductos que salen de la misma producción.
            Los ingredientes se consumen una sola vez y el costo se reparte por
            porcentaje.
          </p>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={() =>
            setRows((current) => [...current, newLine(primaryUnit)])
          }
        >
          + Agregar producto resultante
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[var(--ui-text)]">
              {primaryProductName || "Producto principal"}
            </div>
            <div className="text-xs font-semibold text-[var(--ui-muted)]">
              Producto principal · {numberValue(yieldQty, 1)}{" "}
              {primaryUnit || "un"}
            </div>
          </div>
          <span
            className={`ui-chip ${
              costIsOverAssigned ? "ui-chip--warn" : "ui-chip--brand"
            }`}
          >
            {primaryPct.toFixed(2)}% costo
          </span>
        </div>

        {costIsOverAssigned ? (
          <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
            El costo asignado a productos adicionales supera 100%. Ajusta los
            porcentajes antes de guardar.
          </div>
        ) : null}
      </div>

      {visibleRows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            if (row._delete) return null;

            const selectedProduct = productById.get(row.product_id);
            const resolvedUnit = productUnit(
              selectedProduct,
              row.expected_unit || primaryUnit || "un",
            );
            const hasSelectedProduct = Boolean(row.product_id);
            const selectedProductHasUnit = Boolean(
              selectedProduct?.stock_unit_code || selectedProduct?.unit,
            );

            return (
              <div
                key={row.id ?? `new-${index}`}
                className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(280px,2fr)_150px_150px_130px_120px] lg:items-end">
                  <label className="block space-y-1">
                    <span className="ui-label">Producto resultante</span>
                    <select
                      className="ui-input w-full"
                      value={row.product_id}
                      onChange={(event) => changeProduct(index, event.target.value)}
                    >
                      <option value="">Selecciona producto</option>
                      {eligibleProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {productLabel(product)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="ui-label">Rol</span>
                    <select
                      className="ui-input w-full"
                      value={row.output_role}
                      onChange={(event) =>
                        updateRow(index, {
                          output_role: event.target
                            .value as RecipeOutputLine["output_role"],
                        })
                      }
                    >
                      <option value="co_product">Coproducto</option>
                      <option value="by_product">Subproducto</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="ui-label">Cantidad esperada</span>
                    <input
                      className="ui-input w-full"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={row.expected_qty}
                      onChange={(event) =>
                        updateRow(index, {
                          expected_qty: numberValue(event.target.value),
                        })
                      }
                    />
                  </label>

                  <div className="block space-y-1">
                    <span className="ui-label">Unidad</span>
                    <div className="ui-input flex w-full items-center bg-[var(--ui-surface-2)] font-semibold text-[var(--ui-text)]">
                      {resolvedUnit}
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="ui-label">% costo</span>
                    <div className="relative">
                      <input
                        className="ui-input w-full pr-8"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.cost_allocation_pct}
                        onChange={(event) =>
                          updateRow(index, {
                            cost_allocation_pct: numberValue(
                              event.target.value,
                            ),
                          })
                        }
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-[var(--ui-muted)]">
                        %
                      </span>
                    </div>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-3">
                  <div className="text-xs leading-5 text-[var(--ui-muted)]">
                    {hasSelectedProduct ? (
                      selectedProductHasUnit ? (
                        <>
                          Unidad base tomada del producto:{" "}
                          <span className="font-semibold text-[var(--ui-text)]">
                            {resolvedUnit}
                          </span>
                        </>
                      ) : (
                        "Este producto no tiene unidad configurada en NEXO. Revisa su ficha."
                      )
                    ) : (
                      "Solo preparaciones o productos vendibles pueden salir como coproducto o subproducto."
                    )}
                  </div>

                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                    onClick={() => removeRow(index)}
                  >
                    Quitar {roleLabel(row.output_role).toLowerCase()}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ui-empty">
          Sin productos adicionales. Esta receta se comporta como producción de
          un solo producto.
        </div>
      )}
    </section>
  );
}
