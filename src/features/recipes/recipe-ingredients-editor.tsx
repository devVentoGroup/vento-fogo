"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type IngredientLine = {
  id?: string;
  ingredient_product_id: string;
  quantity: number | undefined;
  _delete?: boolean;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  cost: number | null;
};

type Props = {
  name?: string;
  initialRows: IngredientLine[];
  products: ProductOption[];
};

const emptyLine = (): IngredientLine => ({
  ingredient_product_id: "",
  quantity: undefined,
});

export function RecipeIngredientsEditor({
  name = "ingredient_lines",
  initialRows,
  products,
}: Props) {
  const [lines, setLines] = useState<IngredientLine[]>(
    initialRows.length ? initialRows : [emptyLine()]
  );
  const [lineSearch, setLineSearch] = useState<Record<number, string>>({});
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const productLabelById = useMemo(() => {
    return new Map(
      products.map((p) => [
        p.id,
        `${p.name ?? p.id}${p.sku ? ` (${p.sku})` : ""}`,
      ])
    );
  }, [products]);
  const productByExactLabel = useMemo(() => {
    return new Map(
      products.map((p) => [
        `${p.name ?? p.id}${p.sku ? ` (${p.sku})` : ""}`,
        p,
      ])
    );
  }, [products]);

  const updateLine = useCallback((index: number, patch: Partial<IngredientLine>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      const line = prev[index];
      if (line?.id) {
        return prev.map((l, i) => (i === index ? { ...l, _delete: true } : l));
      }
      return prev.filter((_, i) => i !== index);
    });
    setOpenRow(null);
    setLineSearch((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const visibleLines = lines.filter((l) => !l._delete);

  const totalCost = useMemo(() => {
    let total = 0;
    for (const line of visibleLines) {
      const p = productMap.get(line.ingredient_product_id);
      if (p?.cost && line.quantity) total += p.cost * line.quantity;
    }
    return total;
  }, [visibleLines, productMap]);

  const updateDropdownPosition = useCallback((rowIndex: number | null) => {
    if (rowIndex == null) return;
    const node = inputRefs.current[rowIndex];
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const openText =
    openRow != null
      ? lineSearch[openRow] ?? productLabelById.get(lines[openRow]?.ingredient_product_id ?? "") ?? ""
      : "";
  const openFilteredProducts = useMemo(() => {
    if (openRow == null) return [] as ProductOption[];
    const query = openText.trim().toLowerCase();
    if (!query) return products;
    return products
      .filter((p) => {
        const label = `${p.name ?? p.id}${p.sku ? ` (${p.sku})` : ""}`.toLowerCase();
        return label.includes(query);
      });
  }, [openRow, openText, products]);

  useEffect(() => {
    if (openRow == null) return;
    updateDropdownPosition(openRow);
    const handleScrollOrResize = () => updateDropdownPosition(openRow);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [openRow, updateDropdownPosition]);

  useEffect(() => {
    if (openRow == null) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const inputNode = openRow != null ? inputRefs.current[openRow] : null;
      if (inputNode && target && inputNode.contains(target)) return;
      if (dropdownRef.current && target && dropdownRef.current.contains(target)) return;
      setOpenRow(null);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [openRow]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Ingredientes (BOM)</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost ui-btn--sm">
          + Agregar ingrediente
        </button>
      </div>

      <div className="hidden grid-cols-12 gap-2 border-b border-[var(--ui-border)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:grid">
        <div className="col-span-5">Ingrediente</div>
        <div className="col-span-2">Cantidad</div>
        <div className="col-span-1">Unidad</div>
        <div className="col-span-2">Costo unit.</div>
        <div className="col-span-1">Subtotal</div>
        <div className="col-span-1 text-right">Accion</div>
      </div>
      <div className="space-y-2">
        {visibleLines.map((line, index) => {
          const realIndex = lines.findIndex((l) => l === line);
          const product = productMap.get(line.ingredient_product_id);
          const subtotal =
            product?.cost && line.quantity ? product.cost * line.quantity : null;
          const currentText =
            lineSearch[realIndex] ??
            productLabelById.get(line.ingredient_product_id) ??
            "";
          return (
            <div
              key={line.id ?? `new-${index}`}
              className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--ui-border)] p-3 md:grid-cols-12 md:items-start"
            >
              <div className="md:col-span-5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Ingrediente
                </div>
                <div className="relative">
                  <input
                    type="text"
                    ref={(node) => {
                      inputRefs.current[realIndex] = node;
                    }}
                    value={currentText}
                    onFocus={() => {
                      setOpenRow(realIndex);
                      window.requestAnimationFrame(() => updateDropdownPosition(realIndex));
                    }}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setLineSearch((prev) => ({ ...prev, [realIndex]: raw }));
                      setOpenRow(realIndex);
                      window.requestAnimationFrame(() => updateDropdownPosition(realIndex));
                      const exact = productByExactLabel.get(raw);
                      if (exact) {
                        updateLine(realIndex, { ingredient_product_id: exact.id });
                        return;
                      }
                      if (!raw.trim()) {
                        updateLine(realIndex, { ingredient_product_id: "" });
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => {
                        setLineSearch((prev) => {
                          const typed = (prev[realIndex] ?? "").trim();
                          const exact = productByExactLabel.get(typed);
                          if (exact) return prev;
                          const selectedLabel =
                            productLabelById.get(line.ingredient_product_id) ?? "";
                          const next = { ...prev };
                          next[realIndex] = selectedLabel;
                          return next;
                        });
                      }, 120);
                    }}
                    className="ui-input"
                    placeholder="Buscar ingrediente por nombre o SKU..."
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Cantidad
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={line.quantity ?? ""}
                  onChange={(e) =>
                    updateLine(realIndex, {
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="ui-input"
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-1 flex items-center text-sm text-[var(--ui-muted)]">
                <div className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Unidad
                </div>
                {product?.unit ?? "-"}
              </div>
              <div className="md:col-span-2 flex items-center text-sm font-mono text-[var(--ui-muted)]">
                <div className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Costo unit.
                </div>
                {product?.cost != null ? `$${product.cost.toLocaleString("es-CO")}` : "-"}
              </div>
              <div className="md:col-span-1 flex items-center text-sm font-mono font-semibold text-[var(--ui-text)]">
                <div className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Subtotal
                </div>
                {subtotal != null ? `$${subtotal.toLocaleString("es-CO")}` : "-"}
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <div className="mr-2 self-center text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] md:hidden">
                  Accion
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(realIndex)}
                  className="ui-btn ui-btn--danger ui-btn--sm"
                >
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
        {visibleLines.length === 0 ? (
          <div className="ui-empty">Sin ingredientes. Agrega al menos uno.</div>
        ) : null}
      </div>
      {totalCost > 0 ? (
        <div className="mt-2 flex items-center justify-between border-t border-[var(--ui-border)] pt-3">
          <span className="font-semibold text-[var(--ui-text)]">Costo total estimado</span>
          <span className="font-mono font-semibold text-[var(--ui-text)]">
            ${totalCost.toLocaleString("es-CO")}
          </span>
        </div>
      ) : null}
      {typeof document !== "undefined" && openRow != null && dropdownRect
        ? createPortal(
            <div
              ref={dropdownRef}
              className="z-[99999] max-h-56 overflow-auto rounded-lg border border-[var(--ui-border)] bg-white opacity-100 shadow-2xl"
              style={{
                position: "fixed",
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
              }}
            >
              {openFilteredProducts.length > 0 ? (
                openFilteredProducts.map((p) => {
                  const label = `${p.name ?? p.id}${p.sku ? ` (${p.sku})` : ""}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        updateLine(openRow, { ingredient_product_id: p.id });
                        setLineSearch((prev) => ({ ...prev, [openRow]: label }));
                        setOpenRow(null);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--ui-panel-soft)]"
                    >
                      {label}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-[var(--ui-muted)]">
                  Sin coincidencias
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

