export function formatProductionNumber(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

export function normalizeUnitLabel(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "");
}

function plural(value: number, singular: string, pluralValue: string) {
  return Math.abs(value) === 1 ? singular : pluralValue;
}

export function productionUnitName(unit: string | null | undefined, quantity = 2) {
  const normalized = normalizeUnitLabel(unit);

  if (["g", "gr", "grs", "gram", "grams", "gramo", "gramos"].includes(normalized)) {
    return plural(quantity, "gramo", "gramos");
  }
  if (["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos"].includes(normalized)) {
    return plural(quantity, "kilogramo", "kilogramos");
  }
  if (["ml", "mililitro", "mililitros", "cc", "cm3"].includes(normalized)) {
    return plural(quantity, "mililitro", "mililitros");
  }
  if (["l", "lt", "lts", "litro", "litros"].includes(normalized)) {
    return plural(quantity, "litro", "litros");
  }
  if (["un", "und", "unds", "u", "unidad", "unidades", "unit", "units"].includes(normalized)) {
    return plural(quantity, "unidad", "unidades");
  }
  if (["pz", "pza", "pieza", "piezas"].includes(normalized)) {
    return plural(quantity, "pieza", "piezas");
  }
  if (["paquete", "paquetes", "pack", "packs"].includes(normalized)) {
    return plural(quantity, "paquete", "paquetes");
  }
  if (["bolsa", "bolsas"].includes(normalized)) {
    return plural(quantity, "bolsa", "bolsas");
  }

  return String(unit ?? "unidad").trim() || "unidad";
}

export function formatProductionQuantity(quantity: number | null | undefined, unit: string | null | undefined) {
  if (quantity == null || !Number.isFinite(Number(quantity))) return "Pendiente";

  const numericQuantity = Number(quantity);
  const normalized = normalizeUnitLabel(unit);

  if (["g", "gr", "grs", "gram", "grams", "gramo", "gramos"].includes(normalized) && Math.abs(numericQuantity) >= 1000) {
    const converted = numericQuantity / 1000;
    return `${formatProductionNumber(converted, 3)} ${productionUnitName("kg", converted)}`;
  }

  if (["ml", "mililitro", "mililitros", "cc", "cm3"].includes(normalized) && Math.abs(numericQuantity) >= 1000) {
    const converted = numericQuantity / 1000;
    return `${formatProductionNumber(converted, 3)} ${productionUnitName("l", converted)}`;
  }

  return `${formatProductionNumber(numericQuantity, 3)} ${productionUnitName(unit, numericQuantity)}`;
}

export function formatProductionTimeMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const minutes = Number(value);
  return `${formatProductionNumber(minutes, 0)} ${plural(minutes, "minuto", "minutos")}`;
}
