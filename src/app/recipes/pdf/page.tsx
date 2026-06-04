import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { PrintRecipesPdfButton } from "@/features/recipes/recipes-pdf-actions";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const UNASSIGNED_SITE_ID = "__sin_sede__";
const UNASSIGNED_AREA_ID = "__sin_area__";
const RECIPE_STEP_PHOTOS_BUCKET = "recipe-step-photos";

type Relation<T> = T | T[] | null | undefined;

type ProductShape = {
  id?: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  image_url?: string | null;
  catalog_image_url?: string | null;
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
  cover_image_path?: string | null;
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
  image_path: string | null;
};

type RecipeGroup = {
  key: string;
  title: string;
  recipes: RecipeCardRow[];
};

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

function productImage(recipe: RecipeCardRow | null | undefined) {
  const product = one(recipe?.products);
  return recipe?.cover_image_path || product?.catalog_image_url || product?.image_url || "";
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
  return value;
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

function isRemoteOrPublicPath(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function storageImageUrl(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"],
  value: string | null | undefined
) {
  const path = String(value ?? "").trim();
  if (!path) return "";
  if (isRemoteOrPublicPath(path)) return path;
  const { data } = supabase.storage.from(RECIPE_STEP_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl || "";
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

function printStatusClass(value: string | null | undefined) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "published") return "status-pill status-published";
  if (status === "archived") return "status-pill status-archived";
  return "status-pill status-draft";
}

export default async function RecipesPdfPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedAreaId = String(sp.area_id ?? "").trim();
  const requestedStatus = String(sp.status ?? "all").trim().toLowerCase();
  const searchTerm = String(sp.q ?? "").trim();
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
        "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,process_config,status,is_active,updated_at,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,code,name,kind,site_id)"
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
  const selectedStatus = ["published", "draft", "archived"].includes(requestedStatus)
    ? requestedStatus
    : "all";

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
          .select("id,recipe_card_id,step_number,description,tip,time_minutes,image_path")
          .in("recipe_card_id", recipeCardIds)
          .order("step_number", { ascending: true }),
      ])
    : [{ data: [] as IngredientLineRow[] }, { data: [] as StepRow[] }];

  const ingredientRows = (ingredientRowsData ?? []) as IngredientLineRow[];
  const stepRows = (stepRowsData ?? []) as StepRow[];
  const ingredientProductIds = Array.from(
    new Set(
      ingredientRows
        .map((row) => String(row.ingredient_product_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const { data: ingredientProductsData } = ingredientProductIds.length
    ? await supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code,image_url,catalog_image_url")
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

  const recipeGroups = Array.from(
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
      }, new Map<string, RecipeGroup>())
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
    .join(" · ");

  return (
    <main className="recipes-pdf-document min-h-screen bg-[#F7F5F2] text-[#211B17]">
      <style>{`
        :root {
          --fogo-ink: #211B17;
          --fogo-muted: #72665D;
          --fogo-line: #EADDD0;
          --fogo-soft: #FFF7ED;
          --fogo-paper: #FFFFFF;
          --fogo-accent: #F97316;
          --fogo-accent-dark: #C2410C;
        }

        .pdf-shell {
          width: min(1120px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 28px 0 52px;
        }

        .screen-toolbar {
          position: sticky;
          top: 0;
          z-index: 30;
          border-bottom: 1px solid var(--fogo-line);
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(14px);
        }

        .toolbar-inner {
          width: min(1120px, calc(100vw - 32px));
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 0;
        }

        .cover-page,
        .recipe-page {
          background: var(--fogo-paper);
          border: 1px solid var(--fogo-line);
          border-radius: 28px;
          box-shadow: 0 18px 50px rgba(67, 48, 28, 0.10);
          overflow: hidden;
        }

        .cover-page {
          min-height: 720px;
          display: grid;
          grid-template-rows: 1fr auto;
        }

        .cover-hero {
          padding: 48px;
          background:
            radial-gradient(circle at 88% 18%, rgba(249,115,22,.16), transparent 30%),
            linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 58%, #F7F5F2 100%);
        }

        .eyebrow {
          color: var(--fogo-accent-dark);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .22em;
          text-transform: uppercase;
        }

        .cover-title {
          margin-top: 28px;
          max-width: 760px;
          font-size: 64px;
          line-height: .95;
          font-weight: 800;
          letter-spacing: -.045em;
        }

        .cover-subtitle {
          margin-top: 22px;
          max-width: 680px;
          color: var(--fogo-muted);
          font-size: 18px;
          line-height: 1.6;
        }

        .cover-footer {
          display: grid;
          grid-template-columns: 1.3fr .7fr .7fr;
          gap: 12px;
          padding: 22px 48px 42px;
        }

        .summary-box,
        .chapter-card,
        .metric-card,
        .info-card,
        .step-card {
          border: 1px solid var(--fogo-line);
          border-radius: 18px;
          background: #FFFDFC;
        }

        .summary-box {
          padding: 18px;
        }

        .summary-label,
        .metric-label {
          color: var(--fogo-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .summary-value {
          margin-top: 6px;
          color: var(--fogo-ink);
          font-size: 26px;
          font-weight: 800;
        }

        .section-block {
          margin-top: 22px;
        }

        .section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .section-title h2,
        .section-title h4 {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -.02em;
        }

        .toc-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }

        .chapter-card {
          padding: 14px 16px;
        }

        .chapter-name {
          margin-top: 4px;
          font-size: 15px;
          font-weight: 800;
        }

        .chapter-meta {
          margin-top: 4px;
          color: var(--fogo-muted);
          font-size: 12px;
        }

        .recipe-page {
          margin-top: 28px;
          padding: 26px;
        }

        .recipe-header {
          display: grid;
          grid-template-columns: 118px 1fr;
          gap: 18px;
          align-items: stretch;
        }

        .recipe-photo {
          width: 118px;
          height: 118px;
          border-radius: 22px;
          overflow: hidden;
          background: var(--fogo-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--fogo-accent);
          font-size: 42px;
          font-weight: 800;
        }

        .recipe-photo img,
        .step-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--fogo-line);
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .status-published {
          border-color: #A7F3D0;
          background: #ECFDF5;
          color: #047857;
        }

        .status-draft {
          border-color: #FED7AA;
          background: var(--fogo-soft);
          color: var(--fogo-accent-dark);
        }

        .status-archived {
          border-color: #CBD5E1;
          background: #F8FAFC;
          color: #475569;
        }

        .recipe-title {
          margin-top: 8px;
          font-size: 34px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -.04em;
        }

        .recipe-sku {
          margin-top: 6px;
          color: var(--fogo-accent-dark);
          font-size: 12px;
          font-weight: 800;
        }

        .recipe-description {
          margin-top: 8px;
          color: var(--fogo-muted);
          font-size: 13px;
          line-height: 1.45;
        }

        .recipe-location {
          margin-top: 8px;
          color: var(--fogo-muted);
          font-size: 12px;
          font-weight: 650;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          margin-top: 18px;
        }

        .metric-card {
          padding: 10px 11px;
        }

        .metric-value {
          margin-top: 4px;
          font-size: 15px;
          line-height: 1.2;
          font-weight: 850;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 8px;
        }

        .info-card {
          padding: 10px 11px;
        }

        .info-value {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.35;
          font-weight: 750;
        }

        .recipe-content-grid {
          display: grid;
          grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
          gap: 16px;
          align-items: start;
          margin-top: 22px;
        }

        .ingredient-table {
          width: 100%;
          border-collapse: collapse;
          overflow: hidden;
          border-radius: 16px;
          font-size: 12px;
        }

        .ingredient-table thead {
          background: var(--fogo-soft);
          color: var(--fogo-accent-dark);
          font-size: 9px;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .ingredient-table th,
        .ingredient-table td {
          border-bottom: 1px solid #F0E4D9;
          padding: 8px 9px;
          vertical-align: top;
        }

        .ingredient-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .ingredient-name {
          font-weight: 800;
        }

        .muted {
          color: var(--fogo-muted);
        }

        .steps-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .step-card {
          padding: 11px;
          break-inside: avoid;
        }

        .step-with-photo {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 10px;
        }

        .step-photo {
          width: 92px;
          height: 82px;
          border-radius: 14px;
          overflow: hidden;
          background: var(--fogo-soft);
        }

        .step-head {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 6px;
        }

        .step-number {
          width: 25px;
          height: 25px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: var(--fogo-accent);
          color: #fff;
          font-size: 11px;
          font-weight: 850;
        }

        .step-time {
          border-radius: 999px;
          border: 1px solid #FED7AA;
          background: var(--fogo-soft);
          color: var(--fogo-accent-dark);
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 800;
        }

        .step-description {
          font-size: 12px;
          line-height: 1.42;
          font-weight: 650;
        }

        .step-tip {
          margin-top: 6px;
          border-left: 3px solid var(--fogo-accent);
          background: var(--fogo-soft);
          border-radius: 10px;
          padding: 7px 9px;
          color: var(--fogo-accent-dark);
          font-size: 11px;
          line-height: 1.36;
          font-weight: 750;
        }

        .empty-box {
          border: 1px dashed var(--fogo-line);
          border-radius: 16px;
          padding: 18px;
          text-align: center;
          color: var(--fogo-muted);
          font-size: 12px;
        }

        @page {
          size: A4;
          margin: 9mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .recipes-pdf-document,
          .recipes-pdf-document * {
            visibility: visible !important;
          }

          .recipes-pdf-document {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100% !important;
            min-height: auto !important;
            background: #ffffff !important;
          }

          .screen-toolbar,
          .screen-toolbar * {
            display: none !important;
            visibility: hidden !important;
          }

          .pdf-shell {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .cover-page,
          .recipe-page {
            box-shadow: none !important;
            border-radius: 0 !important;
            border: 0 !important;
          }

          .cover-page {
            min-height: calc(297mm - 18mm);
            page-break-after: always;
            break-after: page;
          }

          .cover-hero {
            padding: 20mm 13mm 12mm;
          }

          .cover-title {
            font-size: 48pt;
          }

          .cover-subtitle {
            font-size: 12pt;
          }

          .cover-footer {
            padding: 8mm 13mm 13mm;
          }

          .summary-value {
            font-size: 20pt;
          }

          .toc-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .recipe-page {
            margin: 0 !important;
            padding: 0 !important;
            page-break-before: always;
            break-before: page;
          }

          .recipe-page-inner {
            padding: 5mm 3mm 0;
          }

          .recipe-header {
            grid-template-columns: 24mm 1fr;
            gap: 5mm;
          }

          .recipe-photo {
            width: 24mm;
            height: 24mm;
            border-radius: 6mm;
            font-size: 24pt;
          }

          .recipe-title {
            font-size: 22pt;
          }

          .recipe-description {
            font-size: 8.5pt;
          }

          .recipe-location,
          .recipe-sku {
            font-size: 8pt;
          }

          .metrics-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 2mm;
            margin-top: 5mm;
          }

          .detail-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 2mm;
            margin-top: 2mm;
          }

          .metric-card,
          .info-card {
            border-radius: 4mm;
            padding: 2.2mm;
          }

          .metric-label,
          .summary-label {
            font-size: 6.2pt;
          }

          .metric-value {
            font-size: 9pt;
          }

          .info-value {
            font-size: 7.8pt;
          }

          .recipe-content-grid {
            grid-template-columns: minmax(0, .88fr) minmax(0, 1.12fr);
            gap: 4mm;
            margin-top: 5mm;
          }

          .section-block {
            margin-top: 0;
            break-inside: avoid;
          }

          .section-title {
            margin-bottom: 2mm;
          }

          .section-title h4 {
            font-size: 11pt;
          }

          .ingredient-table {
            font-size: 7.8pt;
          }

          .ingredient-table th,
          .ingredient-table td {
            padding: 1.7mm 2mm;
          }

          .steps-list {
            gap: 2mm;
          }

          .step-card {
            padding: 2.2mm;
          }

          .step-with-photo {
            grid-template-columns: 23mm 1fr;
            gap: 2.5mm;
          }

          .step-photo {
            width: 23mm;
            height: 19mm;
            border-radius: 3mm;
          }

          .step-number {
            width: 6mm;
            height: 6mm;
            font-size: 7pt;
          }

          .step-time {
            padding: 1mm 2mm;
            font-size: 6.6pt;
          }

          .step-description {
            font-size: 8pt;
            line-height: 1.34;
          }

          .step-tip {
            margin-top: 1.5mm;
            padding: 1.8mm 2mm;
            font-size: 7.2pt;
            line-height: 1.25;
          }

          .status-pill {
            padding: 1.2mm 2.2mm;
            font-size: 6.5pt;
          }
        }
      `}</style>

      <div className="screen-toolbar">
        <div className="toolbar-inner">
          <div>
            <div className="eyebrow">Vista PDF administrativa</div>
            <div className="text-sm text-[#72665D]">{recipes.length} recetas · {filterText}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={recipesHref({ siteId: requestedSiteId, areaId: requestedAreaId, status: selectedStatus, q: searchTerm })}
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              Volver a administrar
            </Link>
            <PrintRecipesPdfButton />
          </div>
        </div>
      </div>

      <div className="pdf-shell">
        <section className="cover-page">
          <div className="cover-hero">
            <img src="/logos/vento-group.svg" alt="Vento Group" className="h-20 w-auto object-contain" />
            <div className="eyebrow mt-14">FOGO · Recetario de produccion</div>
            <h1 className="cover-title">Fichas tecnicas operativas</h1>
            <p className="cover-subtitle">
              Documento interno para produccion: ingredientes, rendimiento, porciones, empaque, conservacion y paso a paso.
            </p>
          </div>

          <div className="cover-footer">
            <div className="summary-box">
              <div className="summary-label">Documento</div>
              <div className="summary-value">Vento Group</div>
              <div className="mt-2 text-sm leading-6 text-[#72665D]">Generado: {generatedAt}</div>
            </div>
            <div className="summary-box">
              <div className="summary-label">Recetas</div>
              <div className="summary-value">{recipes.length}</div>
              <div className="mt-2 text-sm text-[#72665D]">incluidas</div>
            </div>
            <div className="summary-box">
              <div className="summary-label">Filtro</div>
              <div className="mt-2 text-base font-bold leading-6">{filterText || "Todos"}</div>
            </div>
          </div>
        </section>

        <section className="section-block rounded-[28px] border border-[#EADDD0] bg-white p-6 shadow-[0_18px_50px_rgba(67,48,28,.08)] print:shadow-none">
          <div className="section-title">
            <div>
              <div className="eyebrow">Indice</div>
              <h2>Capitulos</h2>
            </div>
          </div>
          <div className="toc-grid">
            {recipeGroups.map((group, index) => (
              <div key={group.key} className="chapter-card">
                <div className="eyebrow">Capitulo {index + 1}</div>
                <div className="chapter-name">{group.title}</div>
                <div className="chapter-meta">{group.recipes.length} recetas</div>
              </div>
            ))}
          </div>
        </section>

        {recipes.length === 0 ? (
          <section className="mt-8 rounded-[28px] border border-[#FED7AA] bg-white p-8 text-center">
            <h2 className="text-2xl font-semibold">No hay recetas para exportar</h2>
            <p className="mt-2 text-sm text-[#72665D]">Ajusta los filtros en Administrar recetas y vuelve a generar el PDF.</p>
          </section>
        ) : null}

        {recipeGroups.flatMap((group, groupIndex) =>
          group.recipes.map((recipe, recipeIndex) => {
            const product = one(recipe.products);
            const area = one(recipe.areas);
            const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
            const ingredients = ingredientsByProductId.get(recipe.product_id) ?? [];
            const steps = stepsByRecipeCardId.get(recipe.id) ?? [];
            const firstStepImage = steps.find((step) => step.image_path)?.image_path ?? "";
            const cover = storageImageUrl(supabase, productImage(recipe) || firstStepImage);
            const portionText = recipe.portion_size
              ? `${fmt(recipe.portion_size)} ${recipe.portion_unit ?? recipe.yield_unit}`
              : "Pendiente";
            const totalStepMinutes = steps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
            const timeText = recipe.prep_time_minutes
              ? `${fmt(recipe.prep_time_minutes, 0)} min`
              : totalStepMinutes > 0
                ? `${fmt(totalStepMinutes, 0)} min`
                : "-";
            const vacuumText = hasVacuumPackaging(recipe.process_config) ? "Si" : "No";
            const packageType =
              configText(recipe.process_config, ["package_type", "packaging_type", "bag_type", "tipo_bolsa"]) || "Pendiente";
            const storageText =
              configText(recipe.process_config, ["storage_condition", "storage", "conservation", "condicion_almacenamiento"]) || "Pendiente";

            return (
              <article key={recipe.id} className="recipe-page">
                <div className="recipe-page-inner">
                  <header className="recipe-header">
                    <div className="recipe-photo">
                      {cover ? (
                        <img src={cover} alt={product?.name ?? "Receta"} />
                      ) : (
                        <span>{String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R"}</span>
                      )}
                    </div>

                    <div>
                      <div className="status-row">
                        <span className={printStatusClass(recipe.status)}>{statusLabel(recipe.status)}</span>
                        {!recipe.is_active ? <span className="status-pill status-archived">Inactiva</span> : null}
                        <span className="status-pill status-draft">Cap. {groupIndex + 1}</span>
                        <span className="status-pill status-draft">Ficha {recipeIndex + 1}</span>
                      </div>
                      <h3 className="recipe-title">{product?.name ?? "Receta"}</h3>
                      <p className="recipe-sku">{productSku(recipe)}</p>
                      <p className="recipe-description">
                        {recipe.recipe_description || "Ficha tecnica de produccion para uso interno de Vento Group."}
                      </p>
                      <p className="recipe-location">{siteLabel(site)} - {areaLabel(area)}</p>
                    </div>
                  </header>

                  <section className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-label">Rendimiento</div>
                      <div className="metric-value">{fmt(recipe.yield_qty)} {recipe.yield_unit}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Porcion</div>
                      <div className="metric-value">{portionText}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Tiempo</div>
                      <div className="metric-value">{timeText}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Vida util</div>
                      <div className="metric-value">{recipe.shelf_life_days ? `${fmt(recipe.shelf_life_days, 0)} dias` : "-"}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Dificultad</div>
                      <div className="metric-value">{difficultyLabel(recipe.difficulty)}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Vacio</div>
                      <div className="metric-value">{vacuumText}</div>
                    </div>
                  </section>

                  <section className="detail-grid">
                    <div className="info-card">
                      <div className="metric-label">Empaque</div>
                      <div className="info-value">{packageType}</div>
                    </div>
                    <div className="info-card">
                      <div className="metric-label">Almacenamiento</div>
                      <div className="info-value">{storageText}</div>
                    </div>
                    <div className="info-card">
                      <div className="metric-label">Grupo</div>
                      <div className="info-value">{group.title}</div>
                    </div>
                  </section>

                  <section className="recipe-content-grid">
                    <div className="section-block">
                      <div className="section-title">
                        <div>
                          <div className="eyebrow">Ingredientes</div>
                          <h4>BOM de receta</h4>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-[#EADDD0]">
                        <table className="ingredient-table">
                          <thead>
                            <tr>
                              <th>Ingrediente</th>
                              <th>SKU</th>
                              <th className="text-right">Cant.</th>
                              <th>Un.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ingredients.length > 0 ? (
                              ingredients.map((ingredient, index) => {
                                const ingredientProduct = ingredientProductMap.get(String(ingredient.ingredient_product_id ?? ""));
                                const unit = ingredientProduct?.stock_unit_code || ingredientProduct?.unit || "-";
                                return (
                                  <tr key={`${ingredient.ingredient_product_id}-${index}`}>
                                    <td className="ingredient-name">{ingredientProduct?.name ?? "Ingrediente"}</td>
                                    <td className="muted">{ingredientProduct?.sku ?? "-"}</td>
                                    <td className="text-right font-bold">{fmt(ingredient.quantity, 3)}</td>
                                    <td className="muted">{unit}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={4} className="text-center muted">Sin ingredientes guardados.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="section-block">
                      <div className="section-title">
                        <div>
                          <div className="eyebrow">Paso a paso</div>
                          <h4>{steps.length} pasos operativos</h4>
                        </div>
                      </div>

                      <div className="steps-list">
                        {steps.length > 0 ? (
                          steps.map((step) => {
                            const image = storageImageUrl(supabase, step.image_path);
                            return (
                              <div key={step.id} className="step-card">
                                <div className={image ? "step-with-photo" : ""}>
                                  {image ? (
                                    <div className="step-photo">
                                      <img src={image} alt={`Paso ${step.step_number}`} />
                                    </div>
                                  ) : null}

                                  <div>
                                    <div className="step-head">
                                      <span className="step-number">{step.step_number}</span>
                                      {step.time_minutes != null ? <span className="step-time">{fmt(step.time_minutes, 0)} min</span> : null}
                                    </div>
                                    <p className="step-description">{step.description}</p>
                                    {step.tip ? <div className="step-tip">{step.tip}</div> : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="empty-box">Sin pasos guardados.</div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
