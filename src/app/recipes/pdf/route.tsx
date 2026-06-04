import { NextRequest } from "next/server";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToStream,
} from "@react-pdf/renderer";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_ID = "fogo";
const UNASSIGNED_SITE_ID = "__sin_sede__";
const UNASSIGNED_AREA_ID = "__sin_area__";
const PUBLISHED_STATUS = "published";

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
    paddingTop: 34,
    paddingRight: 38,
    paddingBottom: 42,
    paddingLeft: 38,
    backgroundColor: "#FFFDF9",
    color: "#211B17",
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.34,
  },
  coverPage: {
    paddingTop: 44,
    paddingRight: 44,
    paddingBottom: 44,
    paddingLeft: 44,
    backgroundColor: "#F7F0E8",
    color: "#211B17",
    fontFamily: "Helvetica",
  },
  coverFrame: {
    flexGrow: 1,
    paddingTop: 34,
    paddingRight: 34,
    paddingBottom: 30,
    paddingLeft: 34,
    borderWidth: 1,
    borderColor: "#E5D2C0",
    borderRadius: 26,
    backgroundColor: "#FFFDF9",
  },
  coverBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  markRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F97316",
    color: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  brandName: {
    fontSize: 8,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "#8A7465",
    fontFamily: "Helvetica-Bold",
  },
  internalTag: {
    paddingTop: 6,
    paddingRight: 10,
    paddingBottom: 6,
    paddingLeft: 10,
    borderRadius: 999,
    backgroundColor: "#211B17",
    color: "#FFF7ED",
    fontSize: 7,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  coverRule: {
    marginTop: 86,
    width: 82,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F97316",
  },
  coverKicker: {
    marginTop: 18,
    fontSize: 8,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  coverTitle: {
    marginTop: 14,
    maxWidth: 390,
    fontSize: 39,
    lineHeight: 1.02,
    letterSpacing: -0.7,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  coverSubtitle: {
    marginTop: 18,
    maxWidth: 386,
    fontSize: 11.5,
    lineHeight: 1.52,
    color: "#5F5148",
  },
  coverMetaPanel: {
    marginTop: 54,
    paddingTop: 18,
    paddingRight: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    borderRadius: 18,
    backgroundColor: "#211B17",
    color: "#FFF7ED",
  },
  coverMetaTitle: {
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#FDBA74",
    fontFamily: "Helvetica-Bold",
  },
  coverMetaValue: {
    marginTop: 7,
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  coverMetricsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  coverMetric: {
    flexGrow: 1,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#FFF7ED",
    color: "#211B17",
  },
  smallLabel: {
    fontSize: 7,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#8A7465",
    fontFamily: "Helvetica-Bold",
  },
  metricNumber: {
    marginTop: 5,
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  topBar: {
    marginBottom: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EADDD0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  docTitle: {
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  docMeta: {
    maxWidth: 250,
    fontSize: 8,
    color: "#8A7465",
    textAlign: "right",
  },
  h1: {
    fontSize: 27,
    lineHeight: 1.05,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  h2: {
    fontSize: 15,
    lineHeight: 1.15,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  h3: {
    fontSize: 21,
    lineHeight: 1.06,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  muted: {
    color: "#72665D",
  },
  indexIntro: {
    marginTop: 7,
    marginBottom: 18,
    fontSize: 10,
    color: "#72665D",
  },
  indexGroup: {
    marginBottom: 18,
  },
  indexGroupHeader: {
    marginBottom: 6,
    paddingTop: 9,
    paddingRight: 11,
    paddingBottom: 9,
    paddingLeft: 11,
    borderRadius: 12,
    backgroundColor: "#211B17",
    color: "#FFF7ED",
  },
  indexGroupLabel: {
    fontSize: 7,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#FDBA74",
    fontFamily: "Helvetica-Bold",
  },
  indexGroupTitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 1.15,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  indexRecipeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    paddingRight: 2,
    paddingBottom: 6,
    paddingLeft: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#F0E4D9",
  },
  indexNumber: {
    width: 34,
    fontSize: 8,
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  indexRecipeName: {
    flexGrow: 1,
    fontSize: 9.2,
    color: "#211B17",
  },
  indexRecipeMeta: {
    width: 120,
    fontSize: 8,
    color: "#8A7465",
    textAlign: "right",
  },
  recipeHero: {
    marginBottom: 14,
    paddingTop: 14,
    paddingRight: 16,
    paddingBottom: 14,
    paddingLeft: 16,
    borderRadius: 16,
    backgroundColor: "#211B17",
    color: "#FFF7ED",
  },
  recipeHeroTop: {
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pill: {
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 8,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  pillDark: {
    backgroundColor: "#3A2D26",
    color: "#FDBA74",
  },
  recipeTitle: {
    maxWidth: 470,
    fontSize: 23,
    lineHeight: 1.05,
    letterSpacing: -0.2,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  recipeDescription: {
    marginTop: 7,
    maxWidth: 465,
    color: "#FDEAD6",
    fontSize: 8.8,
    lineHeight: 1.35,
  },
  recipeLocation: {
    marginTop: 7,
    color: "#FDBA74",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  metricCard: {
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    minHeight: 43,
  },
  metricValue: {
    marginTop: 4,
    fontSize: 9.4,
    lineHeight: 1.15,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  infoCard: {
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 10,
    backgroundColor: "#FFFDFC",
  },
  sectionBlock: {
    marginTop: 10,
  },
  sectionHeader: {
    marginBottom: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  sectionSubtle: {
    fontSize: 8,
    color: "#8A7465",
  },
  table: {
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#FFF7ED",
    borderBottomWidth: 1,
    borderBottomColor: "#EADDD0",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F1E5DA",
  },
  tableCell: {
    paddingTop: 7,
    paddingRight: 8,
    paddingBottom: 7,
    paddingLeft: 8,
    fontSize: 8,
  },
  tableHeadCell: {
    paddingTop: 7,
    paddingRight: 8,
    paddingBottom: 7,
    paddingLeft: 8,
    fontSize: 6.8,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  ingredientName: {
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  amountText: {
    color: "#211B17",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  stepCard: {
    marginBottom: 7,
    paddingTop: 9,
    paddingRight: 10,
    paddingBottom: 9,
    paddingLeft: 10,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F97316",
    color: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  stepTime: {
    paddingTop: 3,
    paddingRight: 7,
    paddingBottom: 3,
    paddingLeft: 7,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  stepText: {
    fontSize: 8.4,
    lineHeight: 1.33,
    color: "#211B17",
  },
  stepTip: {
    marginTop: 6,
    paddingTop: 6,
    paddingRight: 7,
    paddingBottom: 6,
    paddingLeft: 7,
    borderLeftWidth: 3,
    borderLeftColor: "#F97316",
    borderRadius: 7,
    backgroundColor: "#FFF7ED",
    color: "#9A3412",
    fontSize: 7.6,
    lineHeight: 1.28,
  },
  emptyBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 12,
    color: "#72665D",
    textAlign: "center",
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 18,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: "#EADDD0",
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#8A7465",
    fontSize: 7,
  },
});

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>FOGO | Vento Group | Documento interno</Text>
      <Text render={({ pageNumber, totalPages }) => `${generatedAt} | Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function StatusPill({ label, tone = "light" }: { label: string; tone?: "light" | "dark" }) {
  return <Text style={tone === "dark" ? [styles.pill, styles.pillDark] : styles.pill}>{label}</Text>;
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
      <View style={styles.tableHeader} fixed>
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

  return (
    <View>
      {steps.map((step) => (
        <View key={`${step.number}-${step.description}`} style={styles.stepCard} wrap={false}>
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.number}</Text>
            </View>
            {step.time ? <Text style={styles.stepTime}>{step.time}</Text> : null}
          </View>
          <Text style={styles.stepText}>{step.description}</Text>
          {step.tip ? <Text style={styles.stepTip}>{step.tip}</Text> : null}
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
      <View style={styles.coverFrame}>
        <View style={styles.coverBrandRow}>
          <View style={styles.markRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>FG</Text>
            </View>
            <View>
              <Text style={styles.brandName}>VENTO GROUP</Text>
              <Text style={[styles.muted, { marginTop: 3, fontSize: 8 }]}>FOGO</Text>
            </View>
          </View>
          <Text style={styles.internalTag}>Uso interno</Text>
        </View>

        <View style={styles.coverRule} />
        <Text style={styles.coverKicker}>Recetario de producción</Text>
        <Text style={styles.coverTitle}>Fichas técnicas operativas</Text>
        <Text style={styles.coverSubtitle}>
          Documento de consulta para cocina: rendimiento, porcionamiento, ingredientes, empaque, almacenamiento y paso a paso de producción.
        </Text>

        <View style={styles.coverMetaPanel}>
          <Text style={styles.coverMetaTitle}>Generado</Text>
          <Text style={styles.coverMetaValue}>{generatedAt}</Text>
          <View style={styles.coverMetricsRow}>
            <View style={styles.coverMetric}>
              <Text style={styles.smallLabel}>Recetas</Text>
              <Text style={styles.metricNumber}>{recipeCount}</Text>
            </View>
            <View style={styles.coverMetric}>
              <Text style={styles.smallLabel}>Capítulos</Text>
              <Text style={styles.metricNumber}>{groupCount}</Text>
            </View>
            <View style={[styles.coverMetric, { flexBasis: 190 }]}>
              <Text style={styles.smallLabel}>Criterio</Text>
              <Text style={[styles.metricNumber, { fontSize: 12, lineHeight: 1.25 }]}>{filterText || "Recetas publicadas"}</Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
}

function IndexPage({ groups, generatedAt }: { groups: PreparedGroup[]; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Índice</Text>
        <Text style={styles.docMeta}>Recetario de producción</Text>
      </View>

      <Text style={styles.h1}>Índice</Text>
      <Text style={styles.indexIntro}>Recetas publicadas organizadas por sede y área de producción.</Text>

      {groups.map((group, groupIndex) => (
        <View key={group.key} style={styles.indexGroup}>
          <View style={styles.indexGroupHeader} wrap={false}>
            <Text style={styles.indexGroupLabel}>Capítulo {groupIndex + 1} - {group.recipes.length} recetas</Text>
            <Text style={styles.indexGroupTitle}>{group.title}</Text>
          </View>

          {group.recipes.map((recipe) => (
            <View key={recipe.id} style={styles.indexRecipeRow} wrap={false}>
              <Text style={styles.indexNumber}>{String(recipe.globalIndex).padStart(2, "0")}</Text>
              <Text style={styles.indexRecipeName}>{recipe.name}</Text>
              <Text style={styles.indexRecipeMeta}>Ficha técnica</Text>
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
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Sin resultados</Text>
        <Text style={styles.docMeta}>Recetario de producción</Text>
      </View>
      <Text style={styles.h1}>No hay recetas publicadas para exportar</Text>
      <Text style={[styles.muted, { marginTop: 10 }]}>Publica al menos una receta activa y vuelve a generar el PDF.</Text>
      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function RecipePage({ recipe, generatedAt }: { recipe: PreparedRecipe; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Ficha técnica</Text>
        <Text style={styles.docMeta}>{recipe.groupTitle}</Text>
      </View>

      <View style={styles.recipeHero} wrap={false}>
        <View style={styles.recipeHeroTop}>
          <StatusPill label={recipe.status} />
          <StatusPill label={`Ficha ${String(recipe.globalIndex).padStart(2, "0")}`} tone="dark" />
        </View>
        <Text style={styles.recipeTitle}>{recipe.name}</Text>
        <Text style={styles.recipeDescription}>{recipe.description}</Text>
        <Text style={styles.recipeLocation}>{recipe.site} · {recipe.area}</Text>
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
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionLabel}>Ingredientes</Text>
          <Text style={styles.sectionSubtle}>{recipe.ingredients.length} líneas</Text>
        </View>
        <IngredientsTable ingredients={recipe.ingredients} />
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader} wrap={false}>
          <Text style={styles.sectionLabel}>Procedimiento</Text>
          <Text style={styles.sectionSubtle}>{recipe.steps.length} pasos</Text>
        </View>
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
