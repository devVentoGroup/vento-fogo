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
  const [yieldQty, setYieldQty] = useState<number>(toPositive(initialYieldQty) || 1);
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

  const normalizedPortionSize = typeof portionSize === "number" ? portionSize : 0;
  const yieldReady = yieldQty > 0 && !!yieldUnit;
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
      yieldQty * (Number(from.factor_to_base) / Number(to.factor_to_base));
    if (!Number.isFinite(yieldInPortionUnit) || yieldInPortionUnit <= 0) return null;
    const count = yieldInPortionUnit / normalizedPortionSize;
    return Number.isFinite(count) && count > 0 ? count : null;
  }, [yieldReady, portionReady, unitMap, yieldUnit, portionUnit, yieldQty, normalizedPortionSize]);

  return (
    <section className="ui-panel space-y-4">
      <h2 className="ui-h2">Ficha base</h2>

      <div className="ui-panel-soft p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
          Resumen operativo
        </div>
        <div className="mt-2 grid gap-2 text-sm text-[var(--ui-muted)] sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <strong className="text-[var(--ui-text)]">Rendimiento:</strong>{" "}
            {yieldQty > 0 ? `${formatNumber(yieldQty)} ${yieldUnit || "-"}` : "Pendiente"}
          </p>
          <p>
            <strong className="text-[var(--ui-text)]">Porcion:</strong>{" "}
            {portionReady ? `${formatNumber(normalizedPortionSize)} ${portionUnit}` : "Pendiente"}
          </p>
          <p>
            <strong className="text-[var(--ui-text)]">Porciones totales:</strong>{" "}
            {portionsCount != null ? formatNumber(portionsCount) : "Pendiente"}
          </p>
          <p>
            <strong className="text-[var(--ui-text)]">Vida util:</strong>{" "}
            {typeof shelfLifeDays === "number" && shelfLifeDays >= 0 ? `${shelfLifeDays} dias` : "Sin definir"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--ui-border)] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 1</div>
          <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Rendimiento</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Rendimiento (cantidad)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                name="yield_qty"
                value={yieldQty}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setYieldQty(Number.isFinite(value) && value > 0 ? value : 1);
                }}
                className="ui-input"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad rendimiento</span>
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
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--ui-border)] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Paso 2</div>
          <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Porcion</p>
          {yieldReady ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Porcion (tamano)</span>
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
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad porcion</span>
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
              </label>
              <p className="sm:col-span-2 text-xs text-[var(--ui-muted)]">
                Solo se muestran unidades compatibles con la familia de rendimiento.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Completa rendimiento para habilitar porciones.
            </p>
          )}
        </div>

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
            <span className="ui-label">Descripcion de receta</span>
            <textarea
              name="recipe_description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="ui-input min-h-0 py-2"
              placeholder="Resumen de tecnica, mise en place y notas clave..."
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
    </section>
  );
}
