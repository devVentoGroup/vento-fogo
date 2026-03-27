"use client";

import { useMemo, useState } from "react";

type UnitOption = {
  code: string;
  name: string | null;
  family: string | null;
  factor_to_base: number | null;
};

type RecipeBaseFieldsProps = {
  initialYieldQty: number;
  initialYieldUnit: string;
  initialPortionSize: number | null;
  initialPortionUnit: string | null;
  initialPrepTimeMinutes: number | null;
  initialShelfLifeDays: number | null;
  initialDifficulty: string | null;
  initialDescription: string | null;
  units: UnitOption[];
  nexoCatalogUrl?: string;
};

function normalizeUnitCode(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function toPositive(value: number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function formatNumber(value: number) {
  return Number(value).toLocaleString("es-CO", {
    maximumFractionDigits: 2,
  });
}

export function RecipeBaseFields({
  initialYieldQty,
  initialYieldUnit,
  initialPortionSize,
  initialPortionUnit,
  initialPrepTimeMinutes,
  initialShelfLifeDays,
  initialDifficulty,
  initialDescription,
  units,
  nexoCatalogUrl,
}: RecipeBaseFieldsProps) {
  const [yieldQty, setYieldQty] = useState<number | "">(toPositive(initialYieldQty) || "");
  const [yieldUnit, setYieldUnit] = useState<string>(normalizeUnitCode(initialYieldUnit) || "un");
  const [portionSize, setPortionSize] = useState<number | "">(
    toPositive(initialPortionSize) || ""
  );
  const [portionUnit, setPortionUnit] = useState<string>(normalizeUnitCode(initialPortionUnit) || "");
  const [prepTime, setPrepTime] = useState<number | "">(
    Number.isFinite(Number(initialPrepTimeMinutes)) ? Number(initialPrepTimeMinutes) : ""
  );
  const [shelfLifeDays, setShelfLifeDays] = useState<number | "">(
    Number.isFinite(Number(initialShelfLifeDays)) ? Number(initialShelfLifeDays) : ""
  );
  const [difficulty, setDifficulty] = useState<string>(String(initialDifficulty ?? ""));
  const [description, setDescription] = useState<string>(String(initialDescription ?? ""));

  const unitMap = useMemo(() => {
    return new Map(units.map((unit) => [normalizeUnitCode(unit.code), unit]));
  }, [units]);

  const yieldUnitRow = unitMap.get(yieldUnit) ?? null;
  const compatiblePortionUnits = useMemo(() => {
    if (!yieldUnitRow?.family) return units;
    return units.filter(
      (unit) => String(unit.family ?? "").trim().toLowerCase() === String(yieldUnitRow.family).trim().toLowerCase()
    );
  }, [units, yieldUnitRow]);

  const portionOptions = useMemo(() => {
    const list = [...compatiblePortionUnits];
    if (portionUnit && !list.some((unit) => normalizeUnitCode(unit.code) === portionUnit)) {
      const custom = unitMap.get(portionUnit);
      list.unshift({
        code: portionUnit,
        name: custom?.name ?? portionUnit.toUpperCase(),
        family: custom?.family ?? null,
        factor_to_base: custom?.factor_to_base ?? null,
      });
    }
    return list;
  }, [compatiblePortionUnits, portionUnit, unitMap]);

  const normalizedYieldQty = typeof yieldQty === "number" ? yieldQty : 0;
  const normalizedPortionSize = typeof portionSize === "number" ? portionSize : 0;
  const yieldReady = normalizedYieldQty > 0 && !!yieldUnit;
  const portionReady = normalizedPortionSize > 0 && !!portionUnit;

  const portionsCount = useMemo(() => {
    if (!yieldReady || !portionReady) return null;
    const from = unitMap.get(yieldUnit);
    const to = unitMap.get(portionUnit);
    if (!from || !to) return null;
    if (
      !from.family ||
      !to.family ||
      from.family !== to.family ||
      !Number(from.factor_to_base) ||
      !Number(to.factor_to_base)
    ) {
      return null;
    }
    const yieldInPortionUnit =
      normalizedYieldQty * (Number(from.factor_to_base) / Number(to.factor_to_base));
    if (!Number.isFinite(yieldInPortionUnit) || yieldInPortionUnit <= 0) return null;
    const count = yieldInPortionUnit / normalizedPortionSize;
    return Number.isFinite(count) && count > 0 ? count : null;
  }, [yieldReady, portionReady, unitMap, yieldUnit, portionUnit, normalizedYieldQty, normalizedPortionSize]);

  const summaryText = useMemo(() => {
    const yieldText = yieldReady ? `${formatNumber(normalizedYieldQty)} ${yieldUnit}` : "rendimiento pendiente";
    if (!portionReady) {
      return `La receta produce ${yieldText}. Falta definir porcion para cerrar costos por unidad.`;
    }
    const portionText = `${formatNumber(normalizedPortionSize)} ${portionUnit}`;
    if (portionsCount == null) {
      return `La receta produce ${yieldText}. Cada porcion es ${portionText}.`;
    }
    return `La receta produce ${yieldText}. Cada porcion es ${portionText}. Salen aprox. ${formatNumber(
      portionsCount
    )} porciones.`;
  }, [yieldReady, normalizedYieldQty, yieldUnit, portionReady, normalizedPortionSize, portionUnit, portionsCount]);

  return (
    <section className="ui-panel space-y-4">
      <h2 className="ui-h2">Ficha base</h2>

      <div className="ui-panel-soft p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Guia rapida
        </div>
        <p className="mt-2 text-sm text-[var(--ui-muted)]">
          Empieza por los 2 datos obligatorios: cuanto sale en total y cuanto mide 1 porcion.
        </p>
        <p className="mt-2 text-sm text-[var(--ui-text)]">{summaryText}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--ui-border)] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 1 (obligatorio)</div>
          <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Rendimiento total</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Cuantas unidades salen de esta receta?</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="yield_qty"
                value={yieldQty}
                onWheel={(event) => {
                  event.currentTarget.blur();
                }}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (!raw) {
                    setYieldQty("");
                    return;
                  }
                  const value = Number(raw);
                  setYieldQty(Number.isFinite(value) && value > 0 ? value : "");
                }}
                className="ui-input"
                required
              />
              <span className="text-xs text-[var(--ui-muted)]">Ejemplo: 109</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad del rendimiento total</span>
              <select
                name="yield_unit"
                value={yieldUnit}
                onChange={(event) => {
                  const next = normalizeUnitCode(event.target.value);
                  setYieldUnit(next);
                  if (portionUnit) {
                    const nextUnit = unitMap.get(next);
                    const currentPortion = unitMap.get(portionUnit);
                    if (
                      nextUnit?.family &&
                      currentPortion?.family &&
                      nextUnit.family !== currentPortion.family
                    ) {
                      setPortionUnit("");
                    }
                  }
                }}
                className="ui-input"
                required
              >
                {units.map((unit) => (
                  <option key={unit.code} value={normalizeUnitCode(unit.code)}>
                    {unit.code} - {unit.name ?? unit.code}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--ui-muted)]">Ejemplo: un, g, ml, porcion.</span>
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--ui-border)] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 2 (obligatorio)</div>
          <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Tamano de una porcion</p>
          {yieldReady ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Cuanto mide 1 porcion?</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="portion_size"
                  value={portionSize}
                  onChange={(event) =>
                    setPortionSize(event.target.value ? Number(event.target.value) : "")
                  }
                  className="ui-input"
                />
                <span className="text-xs text-[var(--ui-muted)]">Ejemplo: 120</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad de esa porcion</span>
                <select
                  name="portion_unit"
                  value={portionUnit}
                  onChange={(event) => setPortionUnit(normalizeUnitCode(event.target.value))}
                  className="ui-input"
                >
                  <option value="">Selecciona unidad</option>
                  {portionOptions.map((unit) => (
                    <option key={unit.code} value={normalizeUnitCode(unit.code)}>
                      {unit.code} - {unit.name ?? unit.code}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">Ejemplo: g, ml, un.</span>
              </label>
              <p className="sm:col-span-2 text-xs text-[var(--ui-muted)]">
                Solo se muestran unidades compatibles con la unidad del rendimiento.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Primero define el rendimiento total para habilitar porciones.
            </p>
          )}
        </div>
      </div>

      <details className="rounded-xl border border-[var(--ui-border)] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
          Configuracion avanzada (opcional)
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--ui-border)] p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 3</div>
            <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Conservacion</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tiempo prep. (min)</span>
                <input
                  type="number"
                  min="0"
                  name="prep_time_minutes"
                  value={prepTime}
                  onChange={(event) => setPrepTime(event.target.value ? Number(event.target.value) : "")}
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Vida util (dias)</span>
                <input
                  type="number"
                  min="0"
                  name="shelf_life_days"
                  value={shelfLifeDays}
                  onChange={(event) =>
                    setShelfLifeDays(event.target.value ? Number(event.target.value) : "")
                  }
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Dificultad</span>
                <select
                  name="difficulty"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="ui-input"
                >
                  <option value="">Sin definir</option>
                  <option value="facil">Facil</option>
                  <option value="medio">Medio</option>
                  <option value="dificil">Dificil</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ui-border)] p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 4</div>
            <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Operacion</p>
            <label className="mt-3 flex flex-col gap-1">
              <span className="ui-label">Descripcion corta de la receta</span>
              <textarea
                name="recipe_description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="ui-input min-h-0 py-2"
                placeholder="Ejemplo: batir, hornear 18 min, enfriar 20 min."
              />
            </label>
            {nexoCatalogUrl ? (
              <p className="mt-2 text-xs text-[var(--ui-muted)]">
                Luego de publicar receta puedes activar remision por porcion desde NEXO en la ficha del producto.
                {" "}
                <a href={nexoCatalogUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Abrir catalogo NEXO
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}
