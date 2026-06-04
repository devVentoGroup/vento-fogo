import { NextRequest } from "next/server";
import {
  Document,
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

type Relation<T> = T | T[] | null | undefined;

type ProductShape = {
  id?: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
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
  sku: string;
  quantity: string;
  unit: string;
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
  sku: string;
  initial: string;
  status: string;
  isActive: boolean;
  description: string;
  site: string;
  area: string;
  groupTitle: string;
  groupIndex: number;
  recipeIndex: number;
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

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function productName(recipe: RecipeCardRow | null | undefined) {
  return one(recipe?.products)?.name || "Receta sin nombre";
}

function productSku(recipe: RecipeCardRow | null | undefined) {
  return one(recipe?.products)?.sku || "Sin SKU";
}

function areaLabel(area: AreaShape | null | undefined) {
  return area?.name || area?.kind || "Sin area";
}

function siteLabel(site: SiteShape | null | undefined) {
  return site?.name || site?.site_type || "Sin sede";
}

function statusLabel(value: string | null | undefined) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "published") return "Publicada";
  if (status === "draft") return "Borrador";
  if (status === "archived") return "Archivada";
  return "Sin estado";
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Simple";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
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
    if (typeof value === "boolean") return value ? "Si" : "No";
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

function firstInitial(value: string) {
  return clean(value, "R").charAt(0).toUpperCase();
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingRight: 32,
    paddingBottom: 34,
    paddingLeft: 32,
    backgroundColor: "#FFFDFB",
    color: "#211B17",
    fontFamily: "Helvetica",
    fontSize: 9,
    lineHeight: 1.32,
  },
  coverPage: {
    padding: 0,
    backgroundColor: "#211B17",
    color: "#FFF7ED",
    fontFamily: "Helvetica",
  },
  coverTop: {
    paddingTop: 58,
    paddingRight: 48,
    paddingBottom: 34,
    paddingLeft: 48,
    minHeight: 560,
  },
  coverBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#F97316",
    color: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  brandName: {
    marginTop: 8,
    fontSize: 9,
    letterSpacing: 2.8,
    textTransform: "uppercase",
    color: "#FED7AA",
  },
  coverKicker: {
    marginTop: 74,
    fontSize: 9,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: "#FDBA74",
    fontFamily: "Helvetica-Bold",
  },
  coverTitle: {
    marginTop: 14,
    maxWidth: 430,
    fontSize: 50,
    lineHeight: 0.95,
    letterSpacing: -1.2,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  coverSubtitle: {
    marginTop: 20,
    maxWidth: 390,
    fontSize: 12,
    lineHeight: 1.55,
    color: "#FDEAD6",
  },
  coverAccentCard: {
    marginTop: 38,
    width: 300,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFF7ED",
    color: "#211B17",
  },
  coverAccentTitle: {
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  coverAccentValue: {
    marginTop: 8,
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },
  coverBottom: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 20,
    paddingRight: 48,
    paddingBottom: 44,
    paddingLeft: 48,
    backgroundColor: "#FFF7ED",
    color: "#211B17",
  },
  coverMetric: {
    flexGrow: 1,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  smallLabel: {
    fontSize: 7,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#8A7465",
    fontFamily: "Helvetica-Bold",
  },
  metricNumber: {
    marginTop: 6,
    fontSize: 21,
    fontFamily: "Helvetica-Bold",
  },
  topBar: {
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EADDD0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  docTitle: {
    fontSize: 9,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  docMeta: {
    fontSize: 8,
    color: "#8A7465",
  },
  h1: {
    fontSize: 25,
    lineHeight: 1.05,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  h2: {
    marginBottom: 10,
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  h3: {
    fontSize: 18,
    lineHeight: 1.05,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  muted: {
    color: "#72665D",
  },
  chapterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chapterCard: {
    width: "48.5%",
    padding: 14,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  chapterTitle: {
    marginTop: 5,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  recipeListItem: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: "#F1E5DA",
    fontSize: 8,
    color: "#72665D",
  },
  recipeHeader: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
  },
  recipeInitial: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: "#FFF7ED",
    color: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  recipeInitialText: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 7,
  },
  pill: {
    paddingTop: 4,
    paddingRight: 7,
    paddingBottom: 4,
    paddingLeft: 7,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  pillGreen: {
    backgroundColor: "#ECFDF5",
    color: "#047857",
  },
  recipeSku: {
    marginTop: 4,
    color: "#C2410C",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  recipeDescription: {
    marginTop: 6,
    maxWidth: 420,
    color: "#72665D",
    fontSize: 8.5,
    lineHeight: 1.35,
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
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  infoCard: {
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 10,
    backgroundColor: "#FFFDFC",
  },
  twoColumn: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  leftColumn: {
    width: "43%",
  },
  rightColumn: {
    width: "57%",
  },
  sectionLabel: {
    marginBottom: 6,
    fontSize: 8,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
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
    paddingTop: 6,
    paddingRight: 6,
    paddingBottom: 6,
    paddingLeft: 6,
    fontSize: 7.2,
  },
  tableHeadCell: {
    paddingTop: 6,
    paddingRight: 6,
    paddingBottom: 6,
    paddingLeft: 6,
    fontSize: 6.5,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#C2410C",
    fontFamily: "Helvetica-Bold",
  },
  ingredientName: {
    fontFamily: "Helvetica-Bold",
    color: "#211B17",
  },
  stepCard: {
    marginBottom: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#EADDD0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 5,
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
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  stepTime: {
    paddingTop: 3,
    paddingRight: 6,
    paddingBottom: 3,
    paddingLeft: 6,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    color: "#C2410C",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  stepText: {
    fontSize: 8,
    lineHeight: 1.32,
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
    fontSize: 7.4,
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
    left: 32,
    right: 32,
    bottom: 16,
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
      <Text>FOGO - Vento Group - Documento interno</Text>
      <Text
        render={({ pageNumber, totalPages }) => `${generatedAt} - Pagina ${pageNumber} de ${totalPages}`}
      />
    </View>
  );
}

function StatusPill({ label, tone = "orange" }: { label: string; tone?: "orange" | "green" }) {
  return <Text style={tone === "green" ? [styles.pill, styles.pillGreen] : styles.pill}>{label}</Text>;
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
        <Text style={[styles.tableHeadCell, { width: "44%" }]}>Ingrediente</Text>
        <Text style={[styles.tableHeadCell, { width: "28%" }]}>SKU</Text>
        <Text style={[styles.tableHeadCell, { width: "16%", textAlign: "right" }]}>Cant.</Text>
        <Text style={[styles.tableHeadCell, { width: "12%" }]}>Un.</Text>
      </View>
      {ingredients.length > 0 ? (
        ingredients.map((ingredient, index) => (
          <View key={`${ingredient.sku}-${index}`} style={styles.tableRow} wrap={false}>
            <Text style={[styles.tableCell, styles.ingredientName, { width: "44%" }]}>{ingredient.name}</Text>
            <Text style={[styles.tableCell, styles.muted, { width: "28%" }]}>{ingredient.sku}</Text>
            <Text style={[styles.tableCell, { width: "16%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
              {ingredient.quantity}
            </Text>
            <Text style={[styles.tableCell, styles.muted, { width: "12%" }]}>{ingredient.unit}</Text>
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
      <View style={styles.coverTop}>
        <View style={styles.coverBrandRow}>
          <View>
            <View style={styles.logoMark}>
              <Text style={styles.logoText}>FG</Text>
            </View>
            <Text style={styles.brandName}>VENTO GROUP</Text>
          </View>
          <Text style={{ color: "#FDBA74", fontSize: 8, letterSpacing: 1.6 }}>DOCUMENTO INTERNO</Text>
        </View>

        <Text style={styles.coverKicker}>FOGO - RECETARIO DE PRODUCCION</Text>
        <Text style={styles.coverTitle}>Fichas tecnicas operativas</Text>
        <Text style={styles.coverSubtitle}>
          Documento estructurado para produccion: rendimiento, porcionamiento, ingredientes, empaque, almacenamiento y paso a paso operativo.
        </Text>

        <View style={styles.coverAccentCard}>
          <Text style={styles.coverAccentTitle}>Generado</Text>
          <Text style={styles.coverAccentValue}>{generatedAt}</Text>
        </View>
      </View>

      <View style={styles.coverBottom}>
        <View style={styles.coverMetric}>
          <Text style={styles.smallLabel}>Recetas</Text>
          <Text style={styles.metricNumber}>{recipeCount}</Text>
        </View>
        <View style={styles.coverMetric}>
          <Text style={styles.smallLabel}>Capitulos</Text>
          <Text style={styles.metricNumber}>{groupCount}</Text>
        </View>
        <View style={[styles.coverMetric, { flexBasis: 200 }]}>
          <Text style={styles.smallLabel}>Filtro aplicado</Text>
          <Text style={[styles.metricNumber, { fontSize: 13, lineHeight: 1.25 }]}>{filterText || "Todos"}</Text>
        </View>
      </View>
    </Page>
  );
}

function IndexPage({ groups, generatedAt }: { groups: PreparedGroup[]; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Indice</Text>
        <Text style={styles.docMeta}>Recetario de produccion</Text>
      </View>

      <Text style={styles.h1}>Capitulos</Text>
      <Text style={[styles.muted, { marginTop: 8, marginBottom: 18 }]}>Resumen de grupos incluidos en este recetario.</Text>

      <View style={styles.chapterGrid}>
        {groups.map((group, groupIndex) => (
          <View key={group.key} style={styles.chapterCard} wrap={false}>
            <Text style={styles.smallLabel}>Capitulo {groupIndex + 1}</Text>
            <Text style={styles.chapterTitle}>{group.title}</Text>
            <Text style={[styles.muted, { marginTop: 5 }]}>{group.recipes.length} recetas</Text>
            {group.recipes.slice(0, 4).map((recipe) => (
              <Text key={recipe.id} style={styles.recipeListItem}>
                {recipe.name} - {recipe.sku}
              </Text>
            ))}
            {group.recipes.length > 4 ? (
              <Text style={[styles.muted, { marginTop: 5 }]}>+ {group.recipes.length - 4} recetas adicionales</Text>
            ) : null}
          </View>
        ))}
      </View>

      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function EmptyPage({ generatedAt }: { generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Sin resultados</Text>
        <Text style={styles.docMeta}>Recetario de produccion</Text>
      </View>
      <Text style={styles.h1}>No hay recetas para exportar</Text>
      <Text style={[styles.muted, { marginTop: 10 }]}>Ajusta los filtros en Administrar recetas y vuelve a generar el PDF.</Text>
      <Footer generatedAt={generatedAt} />
    </Page>
  );
}

function RecipePage({ recipe, generatedAt }: { recipe: PreparedRecipe; generatedAt: string }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.topBar} fixed>
        <Text style={styles.docTitle}>FOGO - Ficha tecnica</Text>
        <Text style={styles.docMeta}>{recipe.groupTitle}</Text>
      </View>

      <View style={styles.recipeHeader} wrap={false}>
        <View style={styles.recipeInitial}>
          <Text style={styles.recipeInitialText}>{recipe.initial}</Text>
        </View>
        <View style={{ flexGrow: 1 }}>
          <View style={styles.statusRow}>
            <StatusPill label={recipe.status} tone={recipe.status === "Publicada" ? "green" : "orange"} />
            {!recipe.isActive ? <StatusPill label="Inactiva" /> : null}
            <StatusPill label={`Cap. ${recipe.groupIndex + 1}`} />
            <StatusPill label={`Ficha ${recipe.recipeIndex + 1}`} />
          </View>
          <Text style={styles.h3}>{recipe.name}</Text>
          <Text style={styles.recipeSku}>{recipe.sku}</Text>
          <Text style={styles.recipeDescription}>{recipe.description}</Text>
          <Text style={[styles.muted, { marginTop: 5, fontSize: 8 }]}>{recipe.site} - {recipe.area}</Text>
        </View>
      </View>

      <View style={styles.metricsGrid} wrap={false}>
        <Metric label="Rendimiento" value={recipe.yieldText} />
        <Metric label="Porcion" value={recipe.portionText} />
        <Metric label="Tiempo" value={recipe.timeText} />
        <Metric label="Vida util" value={recipe.shelfLifeText} />
        <Metric label="Dificultad" value={recipe.difficulty} />
        <Metric label="Vacio" value={recipe.vacuum} />
      </View>

      <View style={styles.infoGrid} wrap={false}>
        <InfoCard label="Empaque" value={recipe.packageType} />
        <InfoCard label="Almacenamiento" value={recipe.storage} />
        <InfoCard label="Grupo" value={recipe.groupTitle} />
      </View>

      <View style={styles.twoColumn}>
        <View style={styles.leftColumn}>
          <Text style={styles.sectionLabel}>Ingredientes</Text>
          <IngredientsTable ingredients={recipe.ingredients} />
        </View>

        <View style={styles.rightColumn}>
          <Text style={styles.sectionLabel}>Paso a paso - {recipe.steps.length} pasos</Text>
          <StepsList steps={recipe.steps} />
        </View>
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
      title="FOGO - Recetario de produccion"
      author="Vento Group"
      subject="Fichas tecnicas operativas"
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
  const requestedStatus = String(request.nextUrl.searchParams.get("status") ?? "all").trim().toLowerCase();
  const searchTerm = String(request.nextUrl.searchParams.get("q") ?? "").trim();
  const searchNeedle = searchTerm.toLowerCase();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: recipesHref({
      siteId: requestedSiteId,
      areaId: requestedAreaId,
      status: requestedStatus,
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
  const selectedStatus = ["published", "draft", "archived"].includes(requestedStatus) ? requestedStatus : "all";

  const recipes = recipeRows
    .filter((recipe) => {
      if (requestedSiteId === UNASSIGNED_SITE_ID && recipe.site_id) return false;
      if (requestedSiteId && requestedSiteId !== UNASSIGNED_SITE_ID && recipe.site_id !== requestedSiteId) return false;

      if (requestedAreaId === UNASSIGNED_AREA_ID && recipe.area_id) return false;
      if (requestedAreaId && requestedAreaId !== UNASSIGNED_AREA_ID && recipe.area_id !== requestedAreaId) return false;

      if (selectedStatus !== "all" && String(recipe.status ?? "").toLowerCase() !== selectedStatus) return false;

      if (!searchNeedle) return true;
      const product = one(recipe.products);
      const area = one(recipe.areas);
      const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
      const haystack = [
        product?.name,
        product?.sku,
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
        .select("id,name,sku,unit,stock_unit_code")
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
        const title = `${siteLabel(site)} - ${areaLabel(area)}`;
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
    selectedStatus === "all" ? "Todos los estados" : statusLabel(selectedStatus),
    searchTerm ? `Busqueda: ${searchTerm}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  const groups: PreparedGroup[] = rawGroups.map((group, groupIndex) => ({
    key: group.key,
    title: group.title,
    recipes: group.recipes.map((recipe, recipeIndex) => {
      const product = one(recipe.products);
      const area = one(recipe.areas);
      const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
      const ingredients = ingredientsByProductId.get(recipe.product_id) ?? [];
      const steps = stepsByRecipeCardId.get(recipe.id) ?? [];
      const portionText = recipe.portion_size
        ? `${fmt(recipe.portion_size)} ${recipe.portion_unit ?? recipe.yield_unit}`
        : "Pendiente";
      const totalStepMinutes = steps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
      const timeText = recipe.prep_time_minutes
        ? `${fmt(recipe.prep_time_minutes, 0)} min`
        : totalStepMinutes > 0
          ? `${fmt(totalStepMinutes, 0)} min`
          : "-";
      const packageType =
        configText(recipe.process_config, ["package_type", "packaging_type", "bag_type", "tipo_bolsa"]) || "Pendiente";
      const storage =
        configText(recipe.process_config, ["storage_condition", "storage", "conservation", "condicion_almacenamiento"]) ||
        "Pendiente";

      return {
        id: recipe.id,
        name: clean(product?.name, "Receta"),
        sku: productSku(recipe),
        initial: firstInitial(product?.name ?? "R"),
        status: statusLabel(recipe.status),
        isActive: recipe.is_active,
        description: recipe.recipe_description || "Ficha tecnica de produccion para uso interno de Vento Group.",
        site: siteLabel(site),
        area: areaLabel(area),
        groupTitle: group.title,
        groupIndex,
        recipeIndex,
        yieldText: `${fmt(recipe.yield_qty)} ${recipe.yield_unit}`,
        portionText,
        timeText,
        shelfLifeText: recipe.shelf_life_days ? `${fmt(recipe.shelf_life_days, 0)} dias` : "-",
        difficulty: difficultyLabel(recipe.difficulty),
        vacuum: hasVacuumPackaging(recipe.process_config) ? "Si" : "No",
        packageType,
        storage,
        ingredients: ingredients.map((ingredient) => {
          const ingredientProduct = ingredientProductMap.get(String(ingredient.ingredient_product_id ?? ""));
          return {
            name: clean(ingredientProduct?.name, "Ingrediente"),
            sku: clean(ingredientProduct?.sku, "-"),
            quantity: fmt(ingredient.quantity, 3),
            unit: ingredientProduct?.stock_unit_code || ingredientProduct?.unit || "-",
          };
        }),
        steps: steps.map((step) => ({
          number: step.step_number,
          description: clean(step.description, "Sin descripcion"),
          tip: clean(step.tip, ""),
          time: step.time_minutes != null ? `${fmt(step.time_minutes, 0)} min` : "",
        })),
      };
    }),
  }));

  const stream = await renderToStream(
    <RecipesDocument groups={groups} generatedAt={generatedAt} filterText={filterText} />
  );
  const buffer = await streamToBuffer(stream);
  const filenameParts = ["fogo-recetario", selectedStatus !== "all" ? selectedStatus : null, searchTerm ? safeFilename(searchTerm) : null]
    .filter(Boolean)
    .join("-");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameParts || "fogo-recetario"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
