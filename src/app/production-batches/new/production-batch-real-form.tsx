"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProductionIngredientDraft = {
  ingredientProductId: string;
  productName: string;
  sku: string;
  unitCode: string;
  baseQty: number;
  availableQty: number;
  cost: number;
};

export type ProductionLocationOption = {
  id: string;
  label: string;
};

export type ProductionOutputMode = "inventory_stock" | "sellable_stock" | "order_fulfillment";

type IngredientState = ProductionIngredientDraft & {
  requiredQty: number;
  actualQty: number;
};

type PackageState = {
  localId: string;
  packageIndex: number;
  label: string;
  expectedQty: number;
  actualQty: number;
  unitCode: string;
  notes: string;
};

type ProductionBatchRealFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  recipeId: string;
  backHref: string;
  destinationLocationId: string;
  destinationLocationLabel: string;
  allowDestinationSelection: boolean;
  locations: ProductionLocationOption[];
  outputMode?: ProductionOutputMode;
  outputModeLabel?: string;
  productName: string;
  areaLabel: string;
  expectedYieldQty: number;
  expectedYieldUnit: string;
  portionSize: number;
  portionUnit: string;
  initialProducedQty: number;
  ingredients: ProductionIngredientDraft[];
  notesPlaceholder?: string;
};

function roundQty(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function fmt(value: number, digits = 3) {
  if (!Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function money(value: number) {
  if (!Number.isFinite(Number(value))) return "-";
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value))}`;
}

type UnitFamily = "mass" | "volume" | "count";

type UnitInfo = {
  family: UnitFamily;
  factorToBase: number;
};

const UNIT_INFO: Record<string, UnitInfo> = {
  mg: { family: "mass", factorToBase: 0.001 },
  miligramo: { family: "mass", factorToBase: 0.001 },
  miligramos: { family: "mass", factorToBase: 0.001 },
  g: { family: "mass", factorToBase: 1 },
  gr: { family: "mass", factorToBase: 1 },
  gramo: { family: "mass", factorToBase: 1 },
  gramos: { family: "mass", factorToBase: 1 },
  kg: { family: "mass", factorToBase: 1000 },
  kilo: { family: "mass", factorToBase: 1000 },
  kilos: { family: "mass", factorToBase: 1000 },
  kilogramo: { family: "mass", factorToBase: 1000 },
  kilogramos: { family: "mass", factorToBase: 1000 },

  ml: { family: "volume", factorToBase: 1 },
  mililitro: { family: "volume", factorToBase: 1 },
  mililitros: { family: "volume", factorToBase: 1 },
  l: { family: "volume", factorToBase: 1000 },
  lt: { family: "volume", factorToBase: 1000 },
  lts: { family: "volume", factorToBase: 1000 },
  litro: { family: "volume", factorToBase: 1000 },
  litros: { family: "volume", factorToBase: 1000 },

  un: { family: "count", factorToBase: 1 },
  und: { family: "count", factorToBase: 1 },
  unidad: { family: "count", factorToBase: 1 },
  unidades: { family: "count", factorToBase: 1 },
  porcion: { family: "count", factorToBase: 1 },
  porciones: { family: "count", factorToBase: 1 },
  empaque: { family: "count", factorToBase: 1 },
  empaques: { family: "count", factorToBase: 1 },
  bolsa: { family: "count", factorToBase: 1 },
  bolsas: { family: "count", factorToBase: 1 },
};

const MAX_AUTO_PACKAGE_ROWS = 150;

function unitKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  const firstSegment = raw.split(/\s+-\s+/)[0]?.trim() || raw;
  return firstSegment
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getUnitInfo(value: string | null | undefined) {
  return UNIT_INFO[unitKey(value)] ?? null;
}

function convertQty(params: {
  qty: number;
  fromUnit: string | null | undefined;
  toUnit: string | null | undefined;
}) {
  const qtyValue = Number(params.qty);
  if (!Number.isFinite(qtyValue)) {
    return { qty: 0, compatible: false };
  }

  const from = getUnitInfo(params.fromUnit);
  const to = getUnitInfo(params.toUnit);

  if (from && to && from.family === to.family) {
    return {
      qty: roundQty((qtyValue * from.factorToBase) / to.factorToBase),
      compatible: true,
    };
  }

  const fromKey = unitKey(params.fromUnit);
  const toKey = unitKey(params.toUnit);

  if (!fromKey || !toKey || fromKey === toKey) {
    return { qty: roundQty(qtyValue), compatible: true };
  }

  return { qty: roundQty(qtyValue), compatible: false };
}

function resolveStandardPackageQty(params: {
  portionSize: number;
  portionUnit: string;
  expectedYieldQty: number;
  expectedYieldUnit: string;
  producedQty: number;
}) {
  if (params.portionSize > 0) {
    return convertQty({
      qty: params.portionSize,
      fromUnit: params.portionUnit || params.expectedYieldUnit,
      toUnit: params.expectedYieldUnit,
    });
  }

  const fallbackQty = params.expectedYieldQty > 0 ? params.expectedYieldQty : params.producedQty;
  return { qty: roundQty(fallbackQty), compatible: true };
}

function makePackageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pkg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scaleIngredient(baseQty: number, producedQty: number, expectedYieldQty: number) {
  if (!Number.isFinite(expectedYieldQty) || expectedYieldQty <= 0) return roundQty(baseQty);
  return roundQty(baseQty * (producedQty / expectedYieldQty));
}

function buildSuggestedPackages(params: {
  producedQty: number;
  expectedQty: number;
  unitCode: string;
}) {
  const producedQty = roundQty(params.producedQty);
  const expectedQty = roundQty(params.expectedQty > 0 ? params.expectedQty : producedQty);
  const unitCode = params.unitCode || "un";
  if (producedQty <= 0) return [] as PackageState[];

  if (expectedQty <= 0 || expectedQty >= producedQty) {
    return [
      {
        localId: makePackageId(),
        packageIndex: 1,
        label: "Empaque 1",
        expectedQty: expectedQty > 0 ? expectedQty : producedQty,
        actualQty: producedQty,
        unitCode,
        notes: "",
      },
    ];
  }

  const fullCount = Math.floor(producedQty / expectedQty);
  const remainder = roundQty(producedQty - fullCount * expectedQty);

  if (fullCount + (remainder > 0.001 ? 1 : 0) > MAX_AUTO_PACKAGE_ROWS) {
    return [
      {
        localId: makePackageId(),
        packageIndex: 1,
        label: "Lote empacado",
        expectedQty,
        actualQty: producedQty,
        unitCode,
        notes: `Sugerencia agregada: la porción estándar genera más de ${MAX_AUTO_PACKAGE_ROWS} filas. Divide manualmente si necesitas trazabilidad por empaque.`,
      },
    ];
  }

  const packages: PackageState[] = [];

  if (remainder > 0.001 && remainder < expectedQty * 0.35 && fullCount > 0) {
    const standardCount = Math.max(fullCount - 1, 0);
    for (let index = 1; index <= standardCount; index += 1) {
      packages.push({
        localId: makePackageId(),
        packageIndex: index,
        label: `Empaque ${index}`,
        expectedQty,
        actualQty: expectedQty,
        unitCode,
        notes: "",
      });
    }
    packages.push({
      localId: makePackageId(),
      packageIndex: packages.length + 1,
      label: `Empaque ${packages.length + 1}`,
      expectedQty,
      actualQty: roundQty(expectedQty + remainder),
      unitCode,
      notes: "Final de lote unido a la porción anterior.",
    });
    return packages;
  }

  for (let index = 1; index <= fullCount; index += 1) {
    packages.push({
      localId: makePackageId(),
      packageIndex: index,
      label: `Empaque ${index}`,
      expectedQty,
      actualQty: expectedQty,
      unitCode,
      notes: "",
    });
  }

  if (remainder > 0.001) {
    packages.push({
      localId: makePackageId(),
      packageIndex: packages.length + 1,
      label: `Empaque ${packages.length + 1}`,
      expectedQty,
      actualQty: remainder,
      unitCode,
      notes: "Porción final variable.",
    });
  }

  return packages;
}

function normalizePackageIndexes(packages: PackageState[]) {
  return packages.map((entry, index) => ({
    ...entry,
    packageIndex: index + 1,
    label: entry.label.trim() || `Empaque ${index + 1}`,
  }));
}

function defaultOutputModeLabel(mode: ProductionOutputMode) {
  if (mode === "order_fulfillment") return "Pedido POS / entrega directa";
  if (mode === "sellable_stock") return "Listo para vender";
  return "Guardar como inventario";
}

export function ProductionBatchRealForm({
  action,
  recipeId,
  backHref,
  destinationLocationId,
  destinationLocationLabel,
  allowDestinationSelection,
  locations,
  outputMode = "inventory_stock",
  outputModeLabel,
  productName,
  areaLabel,
  expectedYieldQty,
  expectedYieldUnit,
  portionSize,
  portionUnit,
  initialProducedQty,
  ingredients,
  notesPlaceholder = "Opcional",
}: ProductionBatchRealFormProps) {
  const [producedQtyInput, setProducedQtyInput] = useState(String(initialProducedQty));
  const producedQty = roundQty(Number(producedQtyInput));
  const safeProducedQty = Number.isFinite(producedQty) && producedQty > 0 ? producedQty : 0;
  const standardPackage = resolveStandardPackageQty({
    portionSize,
    portionUnit,
    expectedYieldQty,
    expectedYieldUnit,
    producedQty: safeProducedQty,
  });
  const standardPackageQty = standardPackage.qty;
  const packageUnit = expectedYieldUnit || portionUnit || "un";
  const isOrderFulfillment = outputMode === "order_fulfillment";
  const resolvedOutputModeLabel = outputModeLabel || defaultOutputModeLabel(outputMode);

  const [ingredientRows, setIngredientRows] = useState<IngredientState[]>(() =>
    ingredients.map((ingredient) => {
      const requiredQty = scaleIngredient(ingredient.baseQty, initialProducedQty, expectedYieldQty);
      return {
        ...ingredient,
        requiredQty,
        actualQty: requiredQty,
      };
    })
  );

  const [packages, setPackages] = useState<PackageState[]>(() =>
    buildSuggestedPackages({
      producedQty: initialProducedQty,
      expectedQty: standardPackageQty,
      unitCode: packageUnit,
    })
  );

  const ingredientPayload = useMemo(
    () =>
      ingredientRows.map((ingredient) => ({
        ingredient_product_id: ingredient.ingredientProductId,
        required_qty: roundQty(ingredient.requiredQty),
        actual_qty: roundQty(ingredient.actualQty),
        location_id: null,
      })),
    [ingredientRows]
  );

  const packagePayload = useMemo(
    () =>
      normalizePackageIndexes(packages)
        .filter((entry) => Number(entry.actualQty) > 0)
        .map((entry) => ({
          package_index: entry.packageIndex,
          label: entry.label,
          expected_qty: roundQty(entry.expectedQty),
          actual_qty: roundQty(entry.actualQty),
          unit_code: entry.unitCode,
          notes: entry.notes.trim() || null,
        })),
    [packages]
  );

  const totalPackaged = roundQty(packagePayload.reduce((acc, entry) => acc + Number(entry.actual_qty ?? 0), 0));
  const packageDiff = roundQty(totalPackaged - safeProducedQty);
  const packageMatchesOutput =
    isOrderFulfillment || (safeProducedQty > 0 && Math.abs(packageDiff) <= 0.001);
  const effectivePackagePayload = isOrderFulfillment ? [] : packagePayload;
  const totalCost = ingredientRows.reduce((acc, ingredient) => acc + Number(ingredient.actualQty ?? 0) * Number(ingredient.cost ?? 0), 0);
  const unitCost = safeProducedQty > 0 ? totalCost / safeProducedQty : 0;
  const hasIngredientStockRisk = ingredientRows.some((ingredient) => ingredient.actualQty > ingredient.availableQty + 0.000001);

  const regenerateIngredients = (nextProducedQty: number) => {
    setIngredientRows((prev) =>
      prev.map((ingredient) => {
        const requiredQty = scaleIngredient(ingredient.baseQty, nextProducedQty, expectedYieldQty);
        return { ...ingredient, requiredQty, actualQty: requiredQty };
      })
    );
  };

  const regeneratePackages = (nextProducedQty = safeProducedQty) => {
    setPackages(
      buildSuggestedPackages({
        producedQty: nextProducedQty,
        expectedQty: standardPackageQty,
        unitCode: packageUnit,
      })
    );
  };

  const updateProducedQty = (value: string) => {
    setProducedQtyInput(value);
  };

  const applyProducedQtyToRecipe = () => {
    if (safeProducedQty <= 0) return;
    regenerateIngredients(safeProducedQty);
    regeneratePackages(safeProducedQty);
  };

  const updateIngredient = (ingredientProductId: string, actualQty: number) => {
    setIngredientRows((prev) =>
      prev.map((ingredient) =>
        ingredient.ingredientProductId === ingredientProductId
          ? { ...ingredient, actualQty: roundQty(Math.max(0, actualQty)) }
          : ingredient
      )
    );
  };

  const updatePackage = (localId: string, patch: Partial<PackageState>) => {
    setPackages((prev) =>
      normalizePackageIndexes(
        prev.map((entry) =>
          entry.localId === localId
            ? {
                ...entry,
                ...patch,
                actualQty: patch.actualQty === undefined ? entry.actualQty : roundQty(Math.max(0, Number(patch.actualQty))),
                expectedQty: patch.expectedQty === undefined ? entry.expectedQty : roundQty(Math.max(0, Number(patch.expectedQty))),
              }
            : entry
        )
      )
    );
  };

  const addPackage = () => {
    setPackages((prev) =>
      normalizePackageIndexes([
        ...prev,
        {
          localId: makePackageId(),
          packageIndex: prev.length + 1,
          label: `Empaque ${prev.length + 1}`,
          expectedQty: standardPackageQty > 0 ? standardPackageQty : safeProducedQty,
          actualQty: 0,
          unitCode: packageUnit,
          notes: "",
        },
      ])
    );
  };

  const removePackage = (localId: string) => {
    setPackages((prev) => normalizePackageIndexes(prev.filter((entry) => entry.localId !== localId)));
  };

  const disabled = safeProducedQty <= 0 || ingredientRows.length <= 0 || (!isOrderFulfillment && !packageMatchesOutput);

  return (
    <form action={action} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <input type="hidden" name="recipe_id" value={recipeId} />
      <input type="hidden" name="ingredients_payload" value={JSON.stringify(ingredientPayload)} />
      <input type="hidden" name="packages_payload" value={JSON.stringify(effectivePackagePayload)} />

      <section className="min-w-0 space-y-6">
        <div className="ui-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Receta base</div>
              <h2 className="mt-1 ui-h2">{productName}</h2>
              <p className="mt-1 ui-body-muted">
                {areaLabel} · esperado {fmt(expectedYieldQty)} {expectedYieldUnit}
                {portionSize > 0 ? ` · porción estándar ${fmt(portionSize)} ${portionUnit || expectedYieldUnit}` : ""}
              </p>
              {portionSize > 0 && !standardPackage.compatible ? (
                <div className="mt-3 ui-alert ui-alert--warn">
                  La unidad de porción no es compatible con la unidad de rendimiento. La sugerencia de empaque queda agregada y debe ajustarse manualmente.
                </div>
              ) : null}
            </div>
            <Link href={backHref} className="ui-btn ui-btn--ghost ui-btn--sm">
              Volver al recetario
            </Link>
          </div>
        </div>

        <div className="ui-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="ui-h2">1. Rendimiento real</h2>
              <p className="mt-1 ui-body-muted">
                Registra cuánto salió realmente. Según la ruta operativa, esto puede entrar a inventario o quedar como pedido/POS sin stock terminado.
              </p>
            </div>
            <button
              type="button"
              onClick={applyProducedQtyToRecipe}
              className="ui-btn ui-btn--ghost ui-btn--sm"
              disabled={safeProducedQty <= 0}
            >
              Recalcular sugeridos
            </button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="ui-label">Rendimiento real ({expectedYieldUnit})</span>
              <input
                className="ui-input mt-1"
                type="number"
                min="0.001"
                step="0.001"
                name="qty"
                value={producedQtyInput}
                onChange={(event) => updateProducedQty(event.target.value)}
                required
              />
            </label>
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-label">Variación vs receta</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {fmt(roundQty(safeProducedQty - expectedYieldQty))} {expectedYieldUnit}
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {expectedYieldQty > 0 ? `${fmt(roundQty(((safeProducedQty - expectedYieldQty) / expectedYieldQty) * 100), 2)}%` : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
              <div className="ui-label">Costo estimado real</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{money(totalCost)}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">Unitario aprox. {money(unitCost)}</div>
            </div>
          </div>
        </div>

        <div className="ui-panel min-w-0">
          <h2 className="ui-h2">2. Consumo real de ingredientes</h2>
          <p className="mt-1 ui-body-muted">
            El real usado viene precargado igual al teórico, pero debe poder corregirse antes de cerrar el lote.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--ui-border)] bg-white">
            <div className="hidden min-w-[760px] grid-cols-[minmax(220px,1.3fr)_120px_150px_120px_120px] gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)] lg:grid">
              <div>Ingrediente</div>
              <div>Teórico</div>
              <div>Real usado</div>
              <div>Disponible</div>
              <div>Diferencia</div>
            </div>
            {ingredientRows.map((ingredient) => {
              const diff = roundQty(ingredient.actualQty - ingredient.requiredQty);
              const stockRisk = ingredient.actualQty > ingredient.availableQty + 0.000001;
              return (
                <div key={ingredient.ingredientProductId} className="grid gap-3 border-t border-[var(--ui-border)] px-4 py-3 first:border-t-0 lg:min-w-[760px] lg:grid-cols-[minmax(220px,1.3fr)_120px_150px_120px_120px] lg:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{ingredient.productName}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{ingredient.sku || "Sin SKU"}</div>
                  </div>
                  <div className="text-sm text-[var(--ui-text)]">
                    <span className="lg:hidden ui-label">Teórico: </span>
                    {fmt(ingredient.requiredQty)} {ingredient.unitCode}
                  </div>
                  <label className="block">
                    <span className="lg:hidden ui-label">Real usado</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={ingredient.actualQty}
                      onChange={(event) => updateIngredient(ingredient.ingredientProductId, Number(event.target.value))}
                      className="ui-input h-10"
                    />
                  </label>
                  <div className={stockRisk ? "text-sm font-semibold text-amber-800" : "text-sm text-[var(--ui-text)]"}>
                    <span className="lg:hidden ui-label">Disponible: </span>
                    {fmt(ingredient.availableQty)} {ingredient.unitCode}
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      stockRisk
                        ? "bg-amber-100 text-amber-900"
                        : Math.abs(diff) <= 0.001
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-sky-100 text-sky-900"
                    }`}>
                      {stockRisk ? "Falta stock" : `${diff >= 0 ? "+" : ""}${fmt(diff)} ${ingredient.unitCode}`}
                    </span>
                  </div>
                </div>
              );
            })}
            {ingredientRows.length === 0 ? (
              <div className="ui-empty border-t border-[var(--ui-border)] px-4 py-6">
                Esta receta no tiene ingredientes activos. Agrega ingredientes en la ficha antes de cerrar producción real.
              </div>
            ) : null}
          </div>
          {hasIngredientStockRisk ? (
            <div className="mt-3 ui-alert ui-alert--warn">
              Hay ingredientes con consumo real mayor al stock disponible. El servidor bloqueará el cierre si no alcanza el inventario real.
            </div>
          ) : null}
        </div>

        {isOrderFulfillment ? (
          <div className="ui-panel">
            <h2 className="ui-h2">3. Salida a pedido/POS</h2>
            <p className="mt-1 ui-body-muted">
              Esta ruta no crea stock terminado ni empaques físicos del lote. FOGO consumirá los ingredientes reales y dejará la producción lista para conectarse al pedido/POS.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                <div className="ui-label">Modo de salida</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{resolvedOutputModeLabel}</div>
              </div>
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                <div className="ui-label">Rendimiento real</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{fmt(safeProducedQty)} {expectedYieldUnit}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="ui-label">Stock terminado</div>
                <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">No se crea</div>
              </div>
            </div>
          </div>
        ) : (
        <div className="ui-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="ui-h2">3. Empaque real del lote</h2>
              <p className="mt-1 ui-body-muted">
                Cada bolsa o recipiente queda como empaque físico real del lote. No se crean presentaciones manuales
                para preparaciones; la suma debe coincidir con el rendimiento real.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => regeneratePackages()} className="ui-btn ui-btn--ghost ui-btn--sm">
                Generar sugerencia
              </button>
              <button type="button" onClick={addPackage} className="ui-btn ui-btn--ghost ui-btn--sm">
                Agregar empaque
              </button>
            </div>
          </div>
          {portionSize > 0 ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Tamaño sugerido por empaque: <strong>{fmt(standardPackageQty)} {packageUnit}</strong>
              {portionUnit && portionUnit !== packageUnit ? ` (${fmt(portionSize)} ${portionUnit})` : ""}.
              Puedes ajustar pesos reales, agregar empaques o registrar una porción final variable.
            </p>
          ) : null}

          <div className="mt-4 max-h-[520px] overflow-x-auto overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-white">
            <div className="hidden min-w-[940px] grid-cols-[90px_minmax(180px,1fr)_120px_140px_minmax(180px,1fr)_90px] gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)] lg:grid">
              <div>#</div>
              <div>Etiqueta</div>
              <div>Esperado ({packageUnit})</div>
              <div>Peso real ({packageUnit})</div>
              <div>Notas</div>
              <div></div>
            </div>
            {normalizePackageIndexes(packages).map((entry) => (
              <div key={entry.localId} className="grid gap-3 border-t border-[var(--ui-border)] px-4 py-3 first:border-t-0 lg:min-w-[940px] lg:grid-cols-[90px_minmax(180px,1fr)_120px_140px_minmax(180px,1fr)_90px] lg:items-center">
                <div className="text-sm font-semibold text-[var(--ui-text)]">Empaque {entry.packageIndex}</div>
                <label className="block">
                  <span className="lg:hidden ui-label">Etiqueta</span>
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(event) => updatePackage(entry.localId, { label: event.target.value })}
                    className="ui-input h-10"
                  />
                </label>
                <label className="block">
                  <span className="lg:hidden ui-label">Esperado</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={entry.expectedQty}
                    onChange={(event) => updatePackage(entry.localId, { expectedQty: Number(event.target.value) })}
                    className="ui-input h-10"
                  />
                </label>
                <label className="block">
                  <span className="lg:hidden ui-label">Peso real ({entry.unitCode})</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={entry.actualQty}
                    onChange={(event) => updatePackage(entry.localId, { actualQty: Number(event.target.value) })}
                    className="ui-input h-10"
                  />
                </label>
                <label className="block">
                  <span className="lg:hidden ui-label">Notas</span>
                  <input
                    type="text"
                    value={entry.notes}
                    onChange={(event) => updatePackage(entry.localId, { notes: event.target.value })}
                    className="ui-input h-10"
                    placeholder="Opcional"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removePackage(entry.localId)}
                  className="ui-btn ui-btn--ghost h-10 text-xs font-semibold"
                  disabled={packages.length <= 1}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-label">Rendimiento real</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{fmt(safeProducedQty)} {expectedYieldUnit}</div>
            </div>
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
              <div className="ui-label">Total empacado</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{fmt(totalPackaged)} {expectedYieldUnit}</div>
            </div>
            <div className={`rounded-lg border p-4 ${packageMatchesOutput ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="ui-label">Diferencia</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{packageDiff >= 0 ? "+" : ""}{fmt(packageDiff)} {expectedYieldUnit}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {packageMatchesOutput ? "Listo para confirmar." : "Debe quedar en 0 para cerrar el lote."}
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      <aside className="ui-panel min-w-0 h-fit space-y-4 xl:sticky xl:top-6">
        <h2 className="ui-h2">Confirmación</h2>
        <label className="block">
          <span className="ui-label">{isOrderFulfillment ? "Salida del terminado" : "LOC destino del terminado"}</span>
          {isOrderFulfillment ? (
            <>
              <input type="hidden" name="destination_location_id" value="" />
              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                Pedido POS / entrega directa
              </div>
            </>
          ) : allowDestinationSelection ? (
            <select className="ui-input mt-1" name="destination_location_id" defaultValue={destinationLocationId} required>
              <option value="">Selecciona LOC</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="destination_location_id" value={destinationLocationId} />
              <div className="mt-1 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)]">
                {destinationLocationLabel}
              </div>
            </>
          )}
          <p className="mt-1 text-xs text-[var(--ui-muted)]">
            {isOrderFulfillment
              ? "No se selecciona LOC de destino porque esta ruta no crea stock terminado."
              : allowDestinationSelection
                ? "Sin LOC fijo configurado; selecciona dónde entra el terminado."
                : "Este producto entra al LOC configurado por la ruta operativa."}
          </p>
        </label>
        <label className="block">
          <span className="ui-label">Notas</span>
          <textarea className="ui-input mt-1 min-h-[104px] py-3" name="notes" placeholder={notesPlaceholder} />
        </label>
        <div className="rounded-lg border border-[#FED7AA] bg-[#FFF7ED] p-4">
          <div className="ui-label">Resumen</div>
          <div className="mt-2 space-y-1 text-sm text-[var(--ui-text)]">
            <div>Ingredientes: <strong>{ingredientRows.length}</strong></div>
            <div>Empaques físicos: <strong>{isOrderFulfillment ? 0 : packagePayload.length}</strong></div>
            <div>Rendimiento: <strong>{fmt(safeProducedQty)} {expectedYieldUnit}</strong></div>
            <div>Costo real estimado: <strong>{money(totalCost)}</strong></div>
          </div>
        </div>
        {!isOrderFulfillment && !packageMatchesOutput ? (
          <div className="ui-alert ui-alert--warn">
            El total empacado debe coincidir con el rendimiento real antes de confirmar.
          </div>
        ) : null}
        {isOrderFulfillment ? (
          <div className="ui-alert ui-alert--warn">
            Confirmar esta producción consumirá ingredientes reales, pero no aumentará stock de producto terminado.
          </div>
        ) : null}
        <button type="submit" className="ui-btn ui-btn--brand w-full" disabled={disabled}>
          {isOrderFulfillment ? "Confirmar consumo para pedido" : "Confirmar producción real"}
        </button>
        <Link href={backHref} className="ui-btn ui-btn--ghost w-full">
          Volver
        </Link>
      </aside>
    </form>
  );
}
