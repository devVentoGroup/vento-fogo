import { NextRequest } from "next/server";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";

import path from "node:path";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_ID = "fogo";
const UNASSIGNED_SITE_ID = "__sin_sede__";
const UNASSIGNED_AREA_ID = "__sin_area__";
const PUBLISHED_STATUS = "published";
const LOGO_DIR = path.join(process.cwd(), "public", "logos");
const FOGO_LOGO_SRC = path.join(LOGO_DIR, "fogo.svg");
const VENTO_GROUP_LOGO_SRC = path.join(LOGO_DIR, "vento-group.svg");

Font.registerHyphenationCallback((word) => [word]);

type Relation<T> = T | T[] | null | undefined;

type ProductShape = {
  id?: string;
  name: string | null;
  sku?: string | null;
  unit?: string | null;
  stock_unit_code?: string | null;
};

type IngredientProductShape = ProductShape & {
  id: string;
};

type AreaShape = {
  id: string;
  code?: string | null;
  name: string | null;
  kind: string | null;
  site_id?: string | null;
};

type SiteShape = {
  id: string;
  name: string | null;
  site_type?: string | null;
};

type RecipeCardRow = {
  id: string;
  product_id: string;
  site_id: string | null;
  area_id: string | null;
  yield_qty: number;
  yield_unit: string;
  portion_size: number | null;
  portion_unit: string | null;
  prep_time_minutes: number | null;
  shelf_life_days: number | null;
  difficulty: string | null;
  recipe_description: string | null;
  process_config: Record<string, unknown> | null;
  status: "draft" | "published" | "archived" | string;
  is_active: boolean;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientLineRow = {
  product_id: string;
  ingredient_product_id: string;
  quantity: number | null;
};

type StepRow = {
  id: string;
  recipe_card_id: string;
  step_number: number;
  description: string;
  tip: string | null;
  time_minutes: number | null;
};

type PreparedIngredient = {
  name: string;
  amount: string;
};

type PreparedStep = {
  number: number;
  description: string;
  tip: string;
  time: string;
};

type PreparedRecipe = {
  id: string;
  name: string;
  globalIndex: number;
  status: string;
  description: string;
  site: string;
  area: string;
  groupTitle: string;
  yieldText: string;
  portionText: string;
  timeText: string;
  shelfLifeText: string;
  difficulty: string;
  vacuum: string;
  packageType: string;
  storage: string;
  ingredients: PreparedIngredient[];
  steps: PreparedStep[];
};

type PreparedGroup = {
  key: string;
  title: string;
  recipes: PreparedRecipe[];
};

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function clean(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._/-]+/g, "");
}

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatSmartNumber(value: number) {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 2 : 3;
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: digits,
  }).format(value);
}

function unitName(singular: string, plural: string, value: number) {
  return Math.abs(value) === 1 ? singular : plural;
}

function formatProductionQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  fallback = "Pendiente"
) {
  if (quantity == null || !Number.isFinite(Number(quantity))) return fallback;

  const rawUnit = clean(unit, "");
  const normalized = normalizeText(rawUnit);
  let value = Number(quantity);
  let singular = rawUnit || "";
  let plural = rawUnit || "";

  if (["g", "gr", "gramo", "gramos", "gram"].includes(normalized)) {
    if (Math.abs(value) >= 1000) {
      value = value / 1000;
      singular = "kilogramo";
      plural = "kilogramos";
    } else {
      singular = "gramo";
      plural = "gramos";
    }
  } else if (["kg", "kilo", "kilos", "kilogramo", "kilogramos", "kilogram"].includes(normalized)) {
    singular = "kilogramo";
    plural = "kilogramos";
  } else if (["ml", "mililitro", "mililitros", "milliliter", "milliliters", "cc", "cm3"].includes(normalized)) {
    if (Math.abs(value) >= 1000) {
      value = value / 1000;
      singular = "litro";
      plural = "litros";
    } else {
      singular = "mililitro";
      plural = "mililitros";
    }
  } else if (["l", "lt", "lts", "litro", "litros", "liter", "liters"].includes(normalized)) {
    singular = "litro";
    plural = "litros";
  } else if (["un", "und", "unds", "unidad", "unidades", "u", "pz", "pieza", "piezas"].includes(normalized)) {
    singular = "unidad";
    plural = "unidades";
  } else if (["cda", "cucharada", "cucharadas"].includes(normalized)) {
    singular = "cucharada";
    plural = "cucharadas";
  } else if (["cdta", "cucharadita", "cucharaditas"].includes(normalized)) {
    singular = "cucharadita";
    plural = "cucharaditas";
  }

  const numberText = formatSmartNumber(value);
  const unitText = singular || plural ? unitName(singular, plural || singular, value) : "";
  return unitText ? `${numberText} ${unitText}` : numberText;
}

function formatMinutes(value: number | null | undefined, fallback = "-") {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  const minutes = Number(value);
  return `${fmt(minutes, 0)} ${unitName("minuto", "minutos", minutes)}`;
}

function formatDays(value: number | null | undefined, fallback = "-") {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  const days = Number(value);
  return `${fmt(days, 0)} ${unitName("día", "días", days)}`;
}

function productName(recipe: RecipeCardRow | null | undefined) {
  return one(recipe?.products)?.name || "Receta sin nombre";
}

function areaLabel(area: AreaShape | null | undefined) {
  return area?.name || area?.kind || "Sin área";
}

function siteLabel(site: SiteShape | null | undefined) {
  return site?.name || site?.site_type || "Sin sede";
}

function groupLabel(site: SiteShape | null | undefined, area: AreaShape | null | undefined) {
  return `${siteLabel(site)} · ${areaLabel(area)}`;
}

function statusLabel(value: string | null | undefined) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "published") return "Publicada";
  if (status === "draft") return "Borrador";
  if (status === "archived") return "Archivada";
  return "Sin estado";
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return "Simple";
  if (normalized === "facil") return "Fácil";
  if (normalized === "medio" || normalized === "media") return "Media";
  if (normalized === "dificil") return "Difícil";
  return String(value);
}

function recipesHref(params: {
  siteId?: string | null;
  areaId?: string | null;
  status?: string | null;
  q?: string | null;
}) {
  const qs = new URLSearchParams();
  if (params.siteId) qs.set("site_id", params.siteId);
  if (params.areaId) qs.set("area_id", params.areaId);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  const query = qs.toString();
  return query ? `/recipes?${query}` : "/recipes";
}

function configText(config: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!config) return "";
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "Sí" : "No";
  }
  return "";
}

function hasVacuumPackaging(config: Record<string, unknown> | null | undefined) {
  if (!config) return false;
  const keys = [
    "vacuum_packaging",
    "is_vacuum_packed",
    "vacuumPacked",
    "requires_vacuum",
    "vacuum",
    "empaque_vacio",
  ];
  return keys.some((key) => config[key] === true || String(config[key] ?? "").toLowerCase() === "true");
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingRight: 30,
    paddingBottom: 38,
    paddingLeft: 30,
    backgroundColor: "#FFFCF7",
    color: "#201A16",
    fontFamily: "Helvetica",
    fontSize: 8.4,
    lineHeight: 1.28,
  },
  coverPage: {
    paddingTop: 34,
    paddingRight: 34,
    paddingBottom: 34,
    paddingLeft: 34,
    backgroundColor: "#F8EFE5",
    color: "#201A16",
    fontFamily: "Helvetica",
  },
  coverSheet: {
    position: "relative",
    flexGrow: 1,
    paddingTop: 28,
    paddingRight: 30,
    paddingBottom: 70,
    paddingLeft: 30,
    borderWidth: 1,
    borderColor: "#EBCDB4",
    borderRadius: 22,
    backgroundColor: "#FFFCF7",
  },
  coverTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coverBrandCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoSeal: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  logoSealText: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    letterSpacing: 0.6,
  },
  brandStack: {
    gap: 2,
  },
  brandEyebrow: {
    fontSize: 7,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "#9A4A16",
    fontFamily: "Helvetica-Bold",
  },
  brandProduct: {
    fontSize: 16,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#201A16",
    fontFamily: "Helvetica-Bold",
  },
  ventoWordmark: {
    fontSize: 8,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#6D5A4C",
    fontFamily: "Helvetica-Bold",
  },
  internalBadge: {
    paddingTop: 5,
    paddingRight: 9,
    paddingBottom: 5,
    paddingLeft: 9,
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 999,
    backgroundColor: "#FFF4EA",
    color: "#C2410C",
    fontSize: 6.6,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  coverAccent: {
    marginTop: 76,
    width: 104,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#F97316",
  },
  coverMain: {
    marginTop: 18,
  },
  coverKicker: {
    fontSize: 8,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  coverTitle: {
    marginTop: 12,
    maxWidth: 410,
    fontSize: 41,
    lineHeight: 0.98,
    letterSpacing: -0.9,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  coverSubtitle: {
    marginTop: 16,
    maxWidth: 420,
    fontSize: 11.2,
    lineHeight: 1.45,
    color: "#6D5A4C",
  },
  coverStatsBand: {
    marginTop: 50,
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: "#F5CBA8",
    borderRadius: 18,
    backgroundColor: "#FFF4EA",
  },
  coverStatsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  coverStatsTitle: {
    fontSize: 7,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  coverStatsDate: {
    marginTop: 5,
    fontSize: 17,
    lineHeight: 1.05,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  coverMetricsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  coverMetric: {
    flexGrow: 1,
    paddingTop: 9,
    paddingRight: 10,
    paddingBottom: 9,
    paddingLeft: 10,
    borderWidth: 1,
    borderColor: "#F2D2B9",
    borderRadius: 12,
    backgroundColor: "#FFFCF7",
  },
  coverMetricWide: {
    flexBasis: 196,
  },
  coverWatermark: {
    position: "absolute",
    right: 28,
    bottom: 88,
    width: 235,
    height: 68,
    objectFit: "contain",
    opacity: 0.075,
  },
  coverFooterStrip: {
    position: "absolute",
    left: 30,
    right: 30,
    bottom: 24,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EAD7C6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#8B7767",
    fontSize: 7.4,
  },
  coverFooterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  coverFooterText: {
    color: "#8B7767",
    fontSize: 7.4,
  },
  smallLabel: {
    fontSize: 6.6,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#8B7767",
    fontFamily: "Helvetica-Bold",
  },
  metricNumber: {
    marginTop: 5,
    fontSize: 17,
    lineHeight: 1.05,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  topBar: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EAD7C6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerLogoSmall: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoSmallText: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  fogoLogoLarge: {
    width: 30,
    height: 38,
    objectFit: "contain",
  },
  fogoLogoSmall: {
    width: 18,
    height: 23,
    objectFit: "contain",
  },
  ventoLogoLarge: {
    width: 118,
    height: 34,
    objectFit: "contain",
  },
  ventoLogoSmall: {
    width: 72,
    height: 20,
    objectFit: "contain",
  },
  ventoLogoFooter: {
    width: 86,
    height: 22,
    objectFit: "contain",
  },
  docTitle: {
    fontSize: 7.2,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  docMeta: {
    maxWidth: 250,
    fontSize: 7.2,
    color: "#8B7767",
    textAlign: "right",
  },
  h1: {
    fontSize: 26,
    lineHeight: 1.02,
    letterSpacing: -0.3,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  muted: {
    color: "#6D5A4C",
  },
  indexIntro: {
    marginTop: 6,
    marginBottom: 11,
    fontSize: 9.2,
    color: "#6D5A4C",
  },
  indexSummaryRow: {
    marginBottom: 12,
    flexDirection: "row",
    gap: 7,
  },
  indexSummaryCard: {
    flexGrow: 1,
    paddingTop: 7,
    paddingRight: 9,
    paddingBottom: 7,
    paddingLeft: 9,
    borderWidth: 1,
    borderColor: "#F2D2B9",
    borderRadius: 10,
    backgroundColor: "#FFF4EA",
  },
  indexGroup: {
    marginBottom: 11,
  },
  indexGroupHeader: {
    marginBottom: 5,
    paddingTop: 8,
    paddingRight: 10,
    paddingBottom: 8,
    paddingLeft: 10,
    borderWidth: 1,
    borderColor: "#F2D2B9",
    borderRadius: 12,
    backgroundColor: "#FFF4EA",
  },
  indexGroupLabel: {
    fontSize: 6.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  indexGroupTitle: {
    marginTop: 3,
    fontSize: 12.2,
    lineHeight: 1.12,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  indexTableHeader: {
    flexDirection: "row",
    paddingTop: 5,
    paddingRight: 2,
    paddingBottom: 5,
    paddingLeft: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#EAD7C6",
  },
  indexRecipeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 5,
    paddingRight: 2,
    paddingBottom: 5,
    paddingLeft: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#F0E1D4",
  },
  indexNumber: {
    width: 32,
    fontSize: 7.4,
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  indexRecipeName: {
    flexGrow: 1,
    fontSize: 8.7,
    color: "#201A16",
    fontFamily: "Helvetica-Bold",
  },
  indexRecipeArea: {
    width: 132,
    fontSize: 7.4,
    color: "#6D5A4C",
  },
  indexRecipeMeta: {
    width: 64,
    fontSize: 7.4,
    color: "#8B7767",
    textAlign: "right",
  },
  recipeHero: {
    marginBottom: 9,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 13,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderColor: "#F2D2B9",
    borderLeftColor: "#F97316",
    borderRadius: 14,
    backgroundColor: "#FFF4EA",
  },
  recipeHeroTop: {
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recipeTitle: {
    maxWidth: 470,
    fontSize: 21,
    lineHeight: 1.02,
    letterSpacing: -0.25,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  recipeDescription: {
    marginTop: 5,
    maxWidth: 470,
    color: "#6D5A4C",
    fontSize: 8,
    lineHeight: 1.28,
  },
  recipeLocation: {
    marginTop: 5,
    color: "#C2410C",
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },
  pill: {
    paddingTop: 3.5,
    paddingRight: 7,
    paddingBottom: 3.5,
    paddingLeft: 7,
    borderWidth: 1,
    borderColor: "#F2D2B9",
    borderRadius: 999,
    backgroundColor: "#FFFCF7",
    color: "#C2410C",
    fontSize: 6.5,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  pillAccent: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
    color: "#FFFFFF",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 6,
  },
  metricCard: {
    flexGrow: 1,
    paddingTop: 6,
    paddingRight: 7,
    paddingBottom: 6,
    paddingLeft: 7,
    borderWidth: 1,
    borderColor: "#EAD7C6",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    minHeight: 35,
  },
  metricValue: {
    marginTop: 3,
    fontSize: 8.5,
    lineHeight: 1.1,
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 9,
  },
  infoCard: {
    flexGrow: 1,
    paddingTop: 6,
    paddingRight: 7,
    paddingBottom: 6,
    paddingLeft: 7,
    borderWidth: 1,
    borderColor: "#EAD7C6",
    borderRadius: 9,
    backgroundColor: "#FFFCF7",
    minHeight: 34,
  },
  sectionBlock: {
    marginTop: 5,
  },
  sectionHeader: {
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionMarker: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#F97316",
  },
  sectionLabel: {
    fontSize: 7.4,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  sectionSubtle: {
    fontSize: 7.2,
    color: "#8B7767",
  },
  table: {
    borderWidth: 1,
    borderColor: "#EAD7C6",
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#FFF4EA",
    borderBottomWidth: 1,
    borderBottomColor: "#EAD7C6",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F3E5D8",
    backgroundColor: "#FFFFFF",
  },
  tableCell: {
    paddingTop: 3.2,
    paddingRight: 6,
    paddingBottom: 3.2,
    paddingLeft: 6,
    fontSize: 7.1,
    lineHeight: 1.08,
  },
  tableHeadCell: {
    paddingTop: 3.6,
    paddingRight: 6,
    paddingBottom: 3.6,
    paddingLeft: 6,
    fontSize: 5.9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  ingredientName: {
    fontFamily: "Helvetica-Bold",
    color: "#201A16",
  },
  amountText: {
    color: "#201A16",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  stepsGrid: {
    gap: 5,
  },
  stepRow: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 5,
  },
  stepColumn: {
    width: "50%",
  },
  stepCard: {
    paddingTop: 6,
    paddingRight: 7,
    paddingBottom: 6,
    paddingLeft: 7,
    borderWidth: 1,
    borderColor: "#EAD7C6",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    marginBottom: 4,
  },
  stepIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stepNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F97316",
    color: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 7.2,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  stepTitle: {
    fontSize: 7,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  stepTime: {
    paddingTop: 2.5,
    paddingRight: 5,
    paddingBottom: 2.5,
    paddingLeft: 5,
    borderRadius: 999,
    backgroundColor: "#FFF4EA",
    color: "#C2410C",
    fontSize: 6.4,
    fontFamily: "Helvetica-Bold",
  },
  stepText: {
    fontSize: 7.25,
    lineHeight: 1.18,
    color: "#201A16",
  },
  stepTip: {
    marginTop: 4,
    paddingTop: 4,
    paddingRight: 5,
    paddingBottom: 4,
    paddingLeft: 5,
    borderLeftWidth: 2,
    borderLeftColor: "#F97316",
    borderRadius: 7,
    backgroundColor: "#FFF4EA",
    color: "#9A3412",
    fontSize: 6.5,
    lineHeight: 1.16,
  },
  emptyBox: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAD7C6",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    color: "#6D5A4C",
    textAlign: "center",
    fontSize: 7.8,
  },
  footer: {
    position: "absolute",
    left: 30,
    right: 30,
    bottom: 16,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#EAD7C6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#8B7767",
    fontSize: 6.8,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerLogo: {
    width: 62,
    height: 16,
    objectFit: "contain",
  },
  footerBrand: {
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
});

function BrandLockup({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <View style={styles.headerBrand}>
        <Image src={FOGO_LOGO_SRC} style={styles.fogoLogoSmall} />
        <View>
          <Text style={styles.docTitle}>FOGO</Text>
          <Text style={[styles.muted, { fontSize: 6.6, marginTop: 1 }]}>Vento Group</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.coverBrandCluster}>
      <Image src={FOGO_LOGO_SRC} style={styles.fogoLogoLarge} />
      <View style={styles.brandStack}>
        <Text style={styles.brandEyebrow}>Vento Group</Text>
        <Text style={styles.brandProduct}>FOGO</Text>
      </View>
    </View>
  );
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerLeft}>
        <Image src={VENTO_GROUP_LOGO_SRC} style={styles.footerLogo} />
        <Text style={styles.footerBrand}>USO INTERNO | FOGO</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `${generatedAt} | Pag. ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function StatusPill({ label, tone = "light" }: { label: string; tone?: "light" | "accent" }) {
  return <Text style={tone === "accent" ? [styles.pill, styles.pillAccent] : styles.pill}>{label}</Text>;
}

function TopBar({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.topBar} fixed>
      <BrandLockup compact />
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.docTitle, { textAlign: "right" }]}>{title}</Text>
        <Text style={styles.docMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ label, meta }: { label: string; meta: string }) {
  return (
    <View style={styles.sectionHeader} wrap={false}>
      <View style={styles.sectionTitleGroup}>
        <View style={styles.sectionMarker} />
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      <Text style={styles.sectionSubtle}>{meta}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard} wrap={false}>
      <Text style={styles.smallLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCard} wrap={false}>
      <Text style={styles.smallLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function IngredientsTable({ ingredients }: { ingredients: PreparedIngredient[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader} wrap={false}>
        <Text style={[styles.tableHeadCell, { width: "68%" }]}>Ingrediente</Text>
        <Text style={[styles.tableHeadCell, { width: "32%", textAlign: "right" }]}>Cantidad</Text>
      </View>
      {ingredients.length > 0 ? (
        ingredients.map((ingredient, index) => (
          <View key={`${ingredient.name}-${index}`} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, styles.ingredientName, { width: "68%" }]}>{ingredient.name}</Text>
            <Text style={[styles.tableCell, styles.amountText, { width: "32%" }]}>{ingredient.amount}</Text>
          </View>
        ))
      ) : (
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.muted, { width: "100%", textAlign: "center" }]}>Sin ingredientes guardados.</Text>
        </View>
      )}
    </View>
  );
}

function StepsList({ steps }: { steps: PreparedStep[] }) {
  if (steps.length === 0) {
    return <Text style={styles.emptyBox}>Sin pasos guardados.</Text>;
  }

  const rows: PreparedStep[][] = [];
  for (let index = 0; index < steps.length; index += 2) {
    rows.push(steps.slice(index, index + 2));
  }

  return (
    <View style={styles.stepsGrid}>
      {rows.map((row, rowIndex) => (
        <View key={`step-row-${rowIndex}`} style={styles.stepRow} wrap={false}>
          {row.map((step) => (
            <View key={`${step.number}-${step.description}`} style={styles.stepColumn}>
              <View style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepIdentity}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{step.number}</Text>
                    </View>
                    <Text style={styles.stepTitle}>Paso</Text>
                  </View>
                  {step.time ? <Text style={styles.stepTime}>{step.time}</Text> : null}
                </View>
                <Text style={styles.stepText}>{step.description}</Text>
                {step.tip ? <Text style={styles.stepTip}>{step.tip}</Text> : null}
              </View>
            </View>
          ))}
          {row.length === 1 ? <View style={styles.stepColumn} /> : null}
        </View>
      ))}
    </View>
  );
}

function CoverPage({
  generatedAt,
  filterText,
  recipeCount,
  groupCount,
}: {
  generatedAt: string;
  filterText: string;
  recipeCount: number;
  groupCount: number;
}) {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverSheet}>
        <Image src={VENTO_GROUP_LOGO_SRC} style={styles.coverWatermark} />
        <View style={styles.coverTop}>
          <BrandLockup />
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Image src={VENTO_GROUP_LOGO_SRC} style={styles.ventoLogoLarge} />
            <Text style={styles.internalBadge}>Uso interno</Text>
          </View>
        </View>

        <View style={styles.coverAccent} />
        <View style={styles.coverMain}>
          <Text style={styles.coverKicker}>Recetario de producción</Text>
          <Text style={styles.coverTitle}>Fichas técnicas operativas</Text>
          <Text style={styles.coverSubtitle}>
            Manual de consulta para cocina: rendimiento, porcionamiento, ingredientes, empaque, almacenamiento y paso a paso de producción.
          </Text>
        </View>

        <View style={styles.coverStatsBand}>
          <View style={styles.coverStatsHeader}>
            <View>
              <Text style={styles.coverStatsTitle}>Generado</Text>
              <Text style={styles.coverStatsDate}>{generatedAt}</Text>
            </View>
            <Text style={[styles.internalBadge, { backgroundColor: "#FFFCF7" }]}>Documento vivo</Text>
          </View>
          <View style={styles.coverMetricsRow}>
            <View style={styles.coverMetric}>
              <Text style={styles.smallLabel}>Recetas</Text>
              <Text style={styles.metricNumber}>{recipeCount}</Text>
            </View>
            <View style={styles.coverMetric}>
              <Text style={styles.smallLabel}>Capítulos</Text>
              <Text style={styles.metricNumber}>{groupCount}</Text>
            </View>
            <View style={[styles.coverMetric, styles.coverMetricWide]}>
              <Text style={styles.smallLabel}>Criterio</Text>
              <Text style={[styles.metricNumber, { fontSize: 11.2, lineHeight: 1.18 }]}>{filterText || "Recetas publicadas"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.coverFooterStrip}>
          <View style={styles.coverFooterLeft}>
            <Image src={FOGO_LOGO_SRC} style={styles.fogoLogoSmall} />
            <Text style={styles.coverFooterText}>Uso interno · Recetario de producción · Vento OS</Text>
          </View>
          <Image src={VENTO_GROUP_LOGO_SRC} style={styles.ventoLogoFooter} />
        </View>
      </View>
    </Page>
  );
}

function IndexPage({ groups, generatedAt }: { groups: PreparedGroup[]; generatedAt: string }) {
  const recipes = groups.flatMap((group) => group.recipes);

  return (
    <Page size="A4" style={styles.page} wrap>
      <TopBar title="Índice" meta="Recetario de producción" />

      <Text style={styles.h1}>Índice de recetas</Text>
      <Text style={styles.indexIntro}>Recetas publicadas organizadas por sede y área de producción.</Text>

      <View style={styles.indexSummaryRow} wrap={false}>
        <View style={styles.indexSummaryCard}>
          <Text style={styles.smallLabel}>Recetas</Text>
          <Text style={styles.metricValue}>{recipes.length}</Text>
        </View>
        <View style={styles.indexSummaryCard}>
          <Text style={styles.smallLabel}>Capítulos</Text>
          <Text style={styles.metricValue}>{groups.length}</Text>
        </View>
        <View style={[styles.indexSummaryCard, { flexBasis: 220 }]}>
          <Text style={styles.smallLabel}>Orden</Text>
          <Text style={styles.metricValue}>Sede - área - receta</Text>
        </View>
      </View>

      {groups.map((group, groupIndex) => (
        <View key={group.key} style={styles.indexGroup}>
          <View style={styles.indexGroupHeader} wrap={false}>
            <Text style={styles.indexGroupLabel}>Capítulo {groupIndex + 1} - {group.recipes.length} recetas</Text>
            <Text style={styles.indexGroupTitle}>{group.title}</Text>
          </View>

          <View style={styles.indexTableHeader} fixed>
            <Text style={[styles.smallLabel, { width: 32 }]}>No.</Text>
            <Text style={[styles.smallLabel, { flexGrow: 1 }]}>Receta</Text>
            <Text style={[styles.smallLabel, { width: 132 }]}>Área</Text>
            <Text style={[styles.smallLabel, { width: 64, textAlign: "right" }]}>Ficha</Text>
          </View>

          {group.recipes.map((recipe) => (
            <View key={recipe.id} style={styles.indexRecipeRow} wrap={false}>
              <Text style={styles.indexNumber}>{String(recipe.globalIndex).padStart(2, "0")}</Text>
              <Text style={styles.indexRecipeName}>{recipe.name}</Text>
              <Text style={styles.indexRecipeArea}>{recipe.area}</Text>
              <Text style={styles.indexRecipeMeta}>{String(recipe.globalIndex).padStart(2, "0")}</Text>
            </View>
          ))}
        </View>
      ))}

      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function EmptyPage({ generatedAt }: { generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <TopBar title="Sin resultados" meta="Recetario de producción" />
      <Text style={styles.h1}>No hay recetas publicadas para exportar</Text>
      <Text style={[styles.muted, { marginTop: 10 }]}>Publica al menos una receta activa y vuelve a generar el PDF.</Text>
      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function RecipePage({ recipe, generatedAt }: { recipe: PreparedRecipe; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <TopBar title="Ficha técnica" meta={recipe.groupTitle} />

      <View style={styles.recipeHero} wrap={false}>
        <View style={styles.recipeHeroTop}>
          <StatusPill label={recipe.status} tone="accent" />
          <StatusPill label={`FOGO-REC-${String(recipe.globalIndex).padStart(3, "0")}`} />
        </View>
        <Text style={styles.recipeTitle}>{recipe.name}</Text>
        <Text style={styles.recipeDescription}>{recipe.description}</Text>
        <Text style={styles.recipeLocation}>{recipe.site} - {recipe.area}</Text>
      </View>

      <View style={styles.metricsGrid} wrap={false}>
        <Metric label="Rendimiento" value={recipe.yieldText} />
        <Metric label="Porción" value={recipe.portionText} />
        <Metric label="Tiempo" value={recipe.timeText} />
        <Metric label="Vida útil" value={recipe.shelfLifeText} />
        <Metric label="Dificultad" value={recipe.difficulty} />
        <Metric label="Vacío" value={recipe.vacuum} />
      </View>

      <View style={styles.infoGrid} wrap={false}>
        <InfoCard label="Empaque" value={recipe.packageType} />
        <InfoCard label="Almacenamiento" value={recipe.storage} />
        <InfoCard label="Grupo" value={recipe.groupTitle} />
      </View>

      <View style={styles.sectionBlock}>
        <SectionHeader label="Ingredientes" meta={`${recipe.ingredients.length} líneas`} />
        <IngredientsTable ingredients={recipe.ingredients} />
      </View>

      <View style={styles.sectionBlock}>
        <SectionHeader label="Procedimiento" meta={`${recipe.steps.length} pasos`} />
        <StepsList steps={recipe.steps} />
      </View>

      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function RecipesDocument({
  groups,
  generatedAt,
  filterText,
}: {
  groups: PreparedGroup[];
  generatedAt: string;
  filterText: string;
}) {
  const recipes = groups.flatMap((group) => group.recipes);

  return (
    <Document
      title="FOGO - Recetario de producción"
      author="Vento Group"
      subject="Fichas técnicas operativas"
      creator="Vento OS - FOGO"
      producer="Vento OS - FOGO"
    >
      <CoverPage generatedAt={generatedAt} filterText={filterText} recipeCount={recipes.length} groupCount={groups.length} />
      {groups.length > 0 ? <IndexPage groups={groups} generatedAt={generatedAt} /> : <EmptyPage generatedAt={generatedAt} />}
      {recipes.map((recipe) => (
        <RecipePage key={recipe.id} recipe={recipe} generatedAt={generatedAt} />
      ))}
    </Document>
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  const requestedSiteId = String(request.nextUrl.searchParams.get("site_id") ?? "").trim();
  const requestedAreaId = String(request.nextUrl.searchParams.get("area_id") ?? "").trim();
  const requestedStatus = String(request.nextUrl.searchParams.get("status") ?? PUBLISHED_STATUS).trim().toLowerCase();
  const searchTerm = String(request.nextUrl.searchParams.get("q") ?? "").trim();
  const searchNeedle = searchTerm.toLowerCase();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: recipesHref({
      siteId: requestedSiteId,
      areaId: requestedAreaId,
      status: requestedStatus || PUBLISHED_STATUS,
      q: searchTerm,
    }),
    permissionCode: "production.recipes.manage",
  });

  const [{ data: recipeRowsData }, { data: siteRowsData }] = await Promise.all([
    supabase
      .from("recipe_cards")
      .select(
        "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,process_config,status,is_active,updated_at,products(id,name,sku,unit,stock_unit_code),areas(id,code,name,kind,site_id)"
      )
      .eq("status", PUBLISHED_STATUS)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1200),
    supabase
      .from("sites")
      .select("id,name,site_type")
      .order("name", { ascending: true })
      .limit(200),
  ]);

  const recipeRows = (recipeRowsData ?? []) as RecipeCardRow[];
  const siteRows = (siteRowsData ?? []) as SiteShape[];
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const recipes = recipeRows
    .filter((recipe) => {
      if (requestedSiteId === UNASSIGNED_SITE_ID && recipe.site_id) return false;
      if (requestedSiteId && requestedSiteId !== UNASSIGNED_SITE_ID && recipe.site_id !== requestedSiteId) return false;

      if (requestedAreaId === UNASSIGNED_AREA_ID && recipe.area_id) return false;
      if (requestedAreaId && requestedAreaId !== UNASSIGNED_AREA_ID && recipe.area_id !== requestedAreaId) return false;

      if (String(recipe.status ?? "").toLowerCase() !== PUBLISHED_STATUS) return false;
      if (recipe.is_active === false) return false;

      if (!searchNeedle) return true;
      const product = one(recipe.products);
      const area = one(recipe.areas);
      const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
      const haystack = [
        product?.name,
        areaLabel(area),
        siteLabel(site),
        statusLabel(recipe.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchNeedle);
    })
    .sort((a, b) => {
      const siteCompare = siteLabel(a.site_id ? siteMap.get(a.site_id) : null).localeCompare(
        siteLabel(b.site_id ? siteMap.get(b.site_id) : null),
        "es"
      );
      if (siteCompare !== 0) return siteCompare;
      const areaCompare = areaLabel(one(a.areas)).localeCompare(areaLabel(one(b.areas)), "es");
      if (areaCompare !== 0) return areaCompare;
      return productName(a).localeCompare(productName(b), "es");
    });

  const recipeCardIds = recipes.map((recipe) => recipe.id);
  const productIds = Array.from(new Set(recipes.map((recipe) => recipe.product_id).filter(Boolean)));

  const [{ data: ingredientRowsData }, { data: stepRowsData }] = recipeCardIds.length
    ? await Promise.all([
        productIds.length
          ? supabase
              .from("recipes")
              .select("product_id,ingredient_product_id,quantity")
              .in("product_id", productIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [] as IngredientLineRow[] }),
        supabase
          .from("recipe_steps")
          .select("id,recipe_card_id,step_number,description,tip,time_minutes")
          .in("recipe_card_id", recipeCardIds)
          .order("step_number", { ascending: true }),
      ])
    : [{ data: [] as IngredientLineRow[] }, { data: [] as StepRow[] }];

  const ingredientRows = (ingredientRowsData ?? []) as IngredientLineRow[];
  const stepRows = (stepRowsData ?? []) as StepRow[];
  const ingredientProductIds = Array.from(
    new Set(ingredientRows.map((row) => String(row.ingredient_product_id ?? "").trim()).filter(Boolean))
  );

  const { data: ingredientProductsData } = ingredientProductIds.length
    ? await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code")
        .in("id", ingredientProductIds)
    : { data: [] as IngredientProductShape[] };

  const ingredientProductMap = new Map<string, IngredientProductShape>();
  for (const product of (ingredientProductsData ?? []) as IngredientProductShape[]) {
    ingredientProductMap.set(product.id, product);
  }

  const ingredientsByProductId = ingredientRows.reduce((map, row) => {
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
    return map;
  }, new Map<string, IngredientLineRow[]>());

  const stepsByRecipeCardId = stepRows.reduce((map, row) => {
    const list = map.get(row.recipe_card_id) ?? [];
    list.push(row);
    map.set(row.recipe_card_id, list);
    return map;
  }, new Map<string, StepRow[]>());

  const rawGroups = Array.from(
    recipes
      .reduce((map, recipe) => {
        const area = one(recipe.areas);
        const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
        const title = groupLabel(site, area);
        const key = `${recipe.site_id || "sin_sede"}::${recipe.area_id || "sin_area"}`;
        const group = map.get(key) ?? { key, title, recipes: [] as RecipeCardRow[] };
        group.recipes.push(recipe);
        map.set(key, group);
        return map;
      }, new Map<string, { key: string; title: string; recipes: RecipeCardRow[] }>())
      .values()
  );

  const generatedAt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const filterText = [
    "Recetas publicadas",
    searchTerm ? `Búsqueda: ${searchTerm}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let globalRecipeIndex = 0;
  const groups: PreparedGroup[] = rawGroups.map((group) => ({
    key: group.key,
    title: group.title,
    recipes: group.recipes.map((recipe) => {
      globalRecipeIndex += 1;
      const product = one(recipe.products);
      const area = one(recipe.areas);
      const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
      const ingredients = ingredientsByProductId.get(recipe.product_id) ?? [];
      const steps = stepsByRecipeCardId.get(recipe.id) ?? [];
      const portionText = recipe.portion_size
        ? formatProductionQuantity(recipe.portion_size, recipe.portion_unit ?? recipe.yield_unit)
        : "Pendiente";
      const totalStepMinutes = steps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
      const timeText = recipe.prep_time_minutes
        ? formatMinutes(recipe.prep_time_minutes)
        : totalStepMinutes > 0
          ? formatMinutes(totalStepMinutes)
          : "-";
      const packageType =
        configText(recipe.process_config, ["package_type", "packaging_type", "bag_type", "tipo_bolsa"]) || "Pendiente";
      const storage =
        configText(recipe.process_config, ["storage_condition", "storage", "conservation", "condicion_almacenamiento"]) ||
        "Pendiente";

      return {
        id: recipe.id,
        name: clean(product?.name, "Receta"),
        globalIndex: globalRecipeIndex,
        status: statusLabel(recipe.status),
        description: recipe.recipe_description || "Ficha técnica de producción para uso interno de Vento Group.",
        site: siteLabel(site),
        area: areaLabel(area),
        groupTitle: group.title,
        yieldText: formatProductionQuantity(recipe.yield_qty, recipe.yield_unit),
        portionText,
        timeText,
        shelfLifeText: formatDays(recipe.shelf_life_days),
        difficulty: difficultyLabel(recipe.difficulty),
        vacuum: hasVacuumPackaging(recipe.process_config) ? "Sí" : "No",
        packageType,
        storage,
        ingredients: ingredients.map((ingredient) => {
          const ingredientProduct = ingredientProductMap.get(String(ingredient.ingredient_product_id ?? ""));
          const unit = ingredientProduct?.stock_unit_code || ingredientProduct?.unit || "";
          return {
            name: clean(ingredientProduct?.name, "Ingrediente"),
            amount: formatProductionQuantity(ingredient.quantity, unit),
          };
        }),
        steps: steps.map((step) => ({
          number: step.step_number,
          description: clean(step.description, "Sin descripción"),
          tip: clean(step.tip, ""),
          time: step.time_minutes != null ? formatMinutes(step.time_minutes) : "",
        })),
      };
    }),
  }));

  const stream = await renderToStream(
    <RecipesDocument groups={groups} generatedAt={generatedAt} filterText={filterText} />
  );
  const buffer = await streamToBuffer(stream);
  const filenameParts = ["fogo-recetario-publicadas", searchTerm ? safeFilename(searchTerm) : null]
    .filter(Boolean)
    .join("-");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameParts || "fogo-recetario-publicadas"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
