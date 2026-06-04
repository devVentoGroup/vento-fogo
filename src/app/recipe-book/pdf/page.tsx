import { requireAppAccess } from "@/lib/auth/guard";
import { RecipeBookPdfActions } from "@/features/recipes/recipe-book-pdf-actions";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const UNASSIGNED_SITE_ID = "__sin_sede__";
const UNASSIGNED_AREA_ID = "__sin_area__";
const LOGO_SRC = "/logos/vento-group.svg";

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
  cost: number | null;
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
  cover_image_path: string | null;
  process_config: Record<string, unknown> | null;
  status: string;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientLineRow = {
  product_id: string;
  ingredient_product_id: string;
  quantity: number | null;
};

type IngredientViewRow = IngredientLineRow & {
  product: IngredientProductShape | null;
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
  subtitle: string;
  recipes: RecipeCardRow[];
};

type UnitFamily = "mass" | "volume" | "count";

type UnitConversion = {
  family: UnitFamily;
  factorToBase: number;
};

const PRODUCTION_RECIPE_AREA_KINDS = ["bodega", "cocina_caliente", "panaderia", "reposteria"];
const PRODUCTION_RECIPE_AREA_ORDER = new Map(
  PRODUCTION_RECIPE_AREA_KINDS.map((kind, index) => [kind, index])
);
const PRODUCTION_RECIPE_AREA_CODES = new Set(["BODEGA", "COC-CAL", "PAN-GALL", "REPOSTERIA"]);
const PRODUCTION_RECIPE_AREA_SLUGS = new Set([
  "bodega",
  "bodega_principal",
  "cocina_caliente",
  "galleteria_y_panaderia",
  "reposteria",
]);

const UNIT_CONVERSIONS: Record<string, UnitConversion> = {
  g: { family: "mass", factorToBase: 1 },
  gr: { family: "mass", factorToBase: 1 },
  gramo: { family: "mass", factorToBase: 1 },
  gramos: { family: "mass", factorToBase: 1 },
  kg: { family: "mass", factorToBase: 1000 },
  kilo: { family: "mass", factorToBase: 1000 },
  kilos: { family: "mass", factorToBase: 1000 },
  kilogramo: { family: "mass", factorToBase: 1000 },
  kilogramos: { family: "mass", factorToBase: 1000 },
  mg: { family: "mass", factorToBase: 0.001 },
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
};

function one<T>(value: Relation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(Number(value));
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(value))}`;
}

function normalizeSlug(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeUnit(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function unitKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  const firstSegment = raw.split(/\s+-\s+/)[0]?.trim() || raw;
  return normalizeSlug(firstSegment).replace(/_/g, "");
}

function unitConversion(value: string | null | undefined): UnitConversion | null {
  return UNIT_CONVERSIONS[unitKey(value)] ?? null;
}

function calculatePortions(params: {
  totalQty: number;
  totalUnit: string | null | undefined;
  portionQty: number;
  portionUnit: string | null | undefined;
}) {
  if (
    !Number.isFinite(params.totalQty) ||
    !Number.isFinite(params.portionQty) ||
    params.portionQty <= 0
  ) {
    return { count: null as number | null, compatible: false };
  }

  const totalInfo = unitConversion(params.totalUnit);
  const portionInfo = unitConversion(params.portionUnit);
  if (totalInfo && portionInfo && totalInfo.family === portionInfo.family) {
    return {
      count: (params.totalQty * totalInfo.factorToBase) / (params.portionQty * portionInfo.factorToBase),
      compatible: true,
    };
  }

  const totalUnit = normalizeUnit(params.totalUnit);
  const portionUnit = normalizeUnit(params.portionUnit);
  if (!totalUnit || !portionUnit || totalUnit === portionUnit) {
    return { count: params.totalQty / params.portionQty, compatible: true };
  }

  return { count: null as number | null, compatible: false };
}

function productName(recipe: RecipeCardRow | null) {
  return one(recipe?.products)?.name || "Receta sin nombre";
}

function productImage(product: ProductShape | null | undefined) {
  return product?.catalog_image_url || product?.image_url || "";
}

function imageUrl(recipe: RecipeCardRow | null) {
  if (!recipe) return "";
  const product = one(recipe.products);
  return recipe.cover_image_path || product?.catalog_image_url || product?.image_url || "";
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Simple";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
  return value;
}

function isDraftStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "draft";
}

function isPublishedStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "published";
}

function statusLabel(value: string | null | undefined) {
  if (isDraftStatus(value)) return "Borrador";
  if (isPublishedStatus(value)) return "Publicada";
  return "Sin estado";
}

function areaLabel(area: AreaShape | null | undefined) {
  return area?.name || area?.kind || "Sin area";
}

function siteLabel(site: SiteShape | null | undefined) {
  return site?.name || site?.site_type || "Sin sede";
}

function isStandalonePanaderiaArea(area: AreaShape) {
  const code = String(area.code ?? "").trim().toUpperCase();
  const slug = normalizeSlug(area.name);
  return code === "PAN" || code === "PANADERIA" || slug === "panaderia";
}

function isProductionRecipeArea(area: AreaShape, allowedKinds: Set<string>) {
  const code = String(area.code ?? "").trim().toUpperCase();
  const kind = String(area.kind ?? "").trim();
  const slug = normalizeSlug(area.name);
  return (
    !isStandalonePanaderiaArea(area) &&
    (allowedKinds.has(kind) ||
      PRODUCTION_RECIPE_AREA_CODES.has(code) ||
      PRODUCTION_RECIPE_AREA_SLUGS.has(slug))
  );
}

function sortProductionAreas(a: AreaShape, b: AreaShape) {
  const areaOrder = (area: AreaShape) => {
    const kindOrder = PRODUCTION_RECIPE_AREA_ORDER.get(String(area.kind ?? ""));
    if (kindOrder != null) return kindOrder;
    const code = String(area.code ?? "").trim().toUpperCase();
    const slug = normalizeSlug(area.name);
    if (code === "BODEGA" || slug === "bodega" || slug === "bodega_principal") return 0;
    if (code === "COC-CAL" || slug === "cocina_caliente") return 1;
    if (code === "PAN-GALL" || slug === "galleteria_y_panaderia") return 2;
    if (code === "REPOSTERIA" || slug === "reposteria") return 3;
    return 999;
  };
  const aOrder = areaOrder(a);
  const bOrder = areaOrder(b);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a.name ?? a.code ?? "").localeCompare(String(b.name ?? b.code ?? ""), "es");
}

function mergeAreas(primary: AreaShape[], recipes: RecipeCardRow[]) {
  const map = new Map<string, AreaShape>();
  for (const area of primary) {
    if (area?.id) map.set(area.id, area);
  }
  for (const recipe of recipes) {
    const area = one(recipe.areas);
    if (area?.id && !map.has(area.id)) map.set(area.id, area);
  }
  return Array.from(map.values());
}

function recipeBookHref(params: {
  siteId?: string | null;
  areaId?: string | null;
  recipeId?: string | null;
  qty?: number | null;
  status?: string | null;
  q?: string | null;
}) {
  const qs = new URLSearchParams();
  if (params.siteId) qs.set("site_id", params.siteId);
  if (params.areaId) qs.set("area_id", params.areaId);
  if (params.recipeId) qs.set("recipe_id", params.recipeId);
  if (params.qty && params.qty > 0) qs.set("qty", String(params.qty));
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  return `/recipe-book${qs.toString() ? `?${qs.toString()}` : ""}`;
}

function processConfig(recipe: RecipeCardRow) {
  const source = recipe.process_config ?? {};
  return {
    vacuumPackaging: source.vacuumPackaging === true,
    controlledCook: source.controlledCook === true,
    specialStorage: source.specialStorage === true,
    specialLabeling: source.specialLabeling === true,
    packagingMethod: String(source.packagingMethod ?? "").trim(),
    vacuumLevel: String(source.vacuumLevel ?? "").trim(),
    sealRange: String(source.sealRange ?? "").trim(),
    bagType: String(source.bagType ?? "").trim(),
    unitsPerPack: source.unitsPerPack,
    cookTemperatureC: source.cookTemperatureC,
    cookTimeMinutes: source.cookTimeMinutes,
    cookEquipment: String(source.cookEquipment ?? "").trim(),
    targetInternalTempC: source.targetInternalTempC,
    storageCondition: String(source.storageCondition ?? "").trim(),
    storageTemperatureC: source.storageTemperatureC,
    labelNotes: String(source.labelNotes ?? "").trim(),
    processNotes: String(source.processNotes ?? "").trim(),
  };
}

function fieldValue(value: unknown, suffix = "") {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && Number.isFinite(value)) return `${fmt(value)}${suffix}`;
  return `${String(value)}${suffix}`;
}

function generatedDate() {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(new Date());
}

export default async function RecipeBookPdfPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    recipe_id?: string;
    qty?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedAreaId = String(sp.area_id ?? "").trim();
  const requestedRecipeId = String(sp.recipe_id ?? "").trim();
  const requestedQty = Number(String(sp.qty ?? "").trim());
  const requestedStatus = String(sp.status ?? "").trim().toLowerCase();
  const searchTerm = String(sp.q ?? "").trim();
  const searchNeedle = searchTerm.toLowerCase();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipe-book/pdf",
    permissionCode: "production.recipe_book.view",
  });

  const [{ data: currentSite }, { data: currentArea }, { data: employeeRow }] = await Promise.all([
    supabase.rpc("current_employee_site_id"),
    supabase.rpc("current_employee_area_id"),
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const currentSiteId = String(currentSite ?? "");
  const currentAreaId = String(currentArea ?? "");
  const role = String(employeeRow?.role ?? "").trim();
  const isOwnerScope = ["propietario", "gerente_general"].includes(role);
  const isManagement = isOwnerScope || role === "gerente";
  const siteFilterIsUnassigned = isOwnerScope && requestedSiteId === UNASSIGNED_SITE_ID;
  const selectedSiteId = isOwnerScope
    ? (siteFilterIsUnassigned ? UNASSIGNED_SITE_ID : requestedSiteId)
    : (currentSiteId || requestedSiteId);
  const realSelectedSiteId = siteFilterIsUnassigned ? "" : selectedSiteId;
  const selectedStatus =
    isManagement && (requestedStatus === "published" || requestedStatus === "draft")
      ? requestedStatus
      : "all";
  const allowedStatuses = isManagement ? ["published", "draft"] : ["published"];

  const [{ data: rpcAreasData }, { data: recipeRowsData }, { data: siteRowsData }] = await Promise.all([
    realSelectedSiteId
      ? supabase.rpc("fogo_recipe_area_options", { p_site_id: realSelectedSiteId })
      : Promise.resolve({ data: [] as AreaShape[] }),
    (() => {
      let query = supabase
        .from("recipe_cards")
        .select(
          "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,process_config,status,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,code,name,kind,site_id)"
        )
        .eq("is_active", true)
        .in("status", allowedStatuses)
        .order("updated_at", { ascending: false })
        .limit(1200);

      if (!isOwnerScope && realSelectedSiteId) {
        query = query.eq("site_id", realSelectedSiteId);
      }

      return query;
    })(),
    isOwnerScope
      ? supabase.from("sites").select("id,name,site_type").order("name", { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as SiteShape[] }),
  ]);

  const siteOptions = (siteRowsData ?? []) as SiteShape[];
  const siteMap = new Map(siteOptions.map((site) => [site.id, site]));

  let recipeAreasData = (rpcAreasData ?? []) as AreaShape[];
  if (realSelectedSiteId && recipeAreasData.length === 0) {
    const { data: fallbackAreasData } = await supabase
      .from("areas")
      .select("id,code,name,kind,site_id")
      .eq("site_id", realSelectedSiteId)
      .eq("is_active", true);
    recipeAreasData = (fallbackAreasData ?? []) as AreaShape[];
  }

  const rawRecipes = (recipeRowsData ?? []) as RecipeCardRow[];
  const recipeSiteName = (recipe: RecipeCardRow) =>
    recipe.site_id ? siteLabel(siteMap.get(recipe.site_id)) : "Sin sede";

  const recipeMatchesSearch = (recipe: RecipeCardRow) => {
    if (!searchNeedle) return true;
    const product = one(recipe.products);
    const area = one(recipe.areas);
    const haystack = [
      product?.name,
      product?.sku,
      areaLabel(area),
      isOwnerScope ? recipeSiteName(recipe) : "",
      statusLabel(recipe.status),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchNeedle);
  };

  const recipeMatchesSite = (recipe: RecipeCardRow) => {
    if (!isOwnerScope) return true;
    if (siteFilterIsUnassigned) return !recipe.site_id;
    return selectedSiteId ? recipe.site_id === selectedSiteId : true;
  };

  const recipeMatchesStatus = (recipe: RecipeCardRow) => {
    if (!isManagement) return isPublishedStatus(recipe.status);
    if (selectedStatus === "published") return isPublishedStatus(recipe.status);
    if (selectedStatus === "draft") return isDraftStatus(recipe.status);
    return isPublishedStatus(recipe.status) || isDraftStatus(recipe.status);
  };

  const searchScopedRecipes = rawRecipes.filter(recipeMatchesSearch);
  const siteScopedRecipes = searchScopedRecipes.filter(recipeMatchesSite);
  const allRecipes = siteScopedRecipes.filter(recipeMatchesStatus);
  const allowedAreaKinds = new Set(PRODUCTION_RECIPE_AREA_KINDS);
  const areas = mergeAreas(recipeAreasData, allRecipes)
    .filter((area) => {
      const areaSiteId = String(area.site_id ?? "");
      if (isOwnerScope && selectedSiteId && !siteFilterIsUnassigned && areaSiteId && areaSiteId !== selectedSiteId) {
        return false;
      }
      return isProductionRecipeArea(area, allowedAreaKinds) || allRecipes.some((recipe) => recipe.area_id === area.id);
    })
    .sort(sortProductionAreas);

  const requestedAreaIsValid =
    requestedAreaId === UNASSIGNED_AREA_ID || areas.some((area) => area.id === requestedAreaId);
  const selectedAreaId = isManagement
    ? (requestedAreaIsValid ? requestedAreaId : "")
    : (currentAreaId || "");

  const filteredRecipes = allRecipes
    .filter((recipe) => {
      if (selectedAreaId === UNASSIGNED_AREA_ID) return !recipe.area_id;
      return selectedAreaId ? recipe.area_id === selectedAreaId : true;
    })
    .filter((recipe) => (requestedRecipeId ? recipe.id === requestedRecipeId : true))
    .sort((a, b) => {
      if (isOwnerScope && !selectedSiteId) {
        const siteCompare = recipeSiteName(a).localeCompare(recipeSiteName(b), "es");
        if (siteCompare !== 0) return siteCompare;
      }
      const areaCompare = areaLabel(one(a.areas)).localeCompare(areaLabel(one(b.areas)), "es");
      if (areaCompare !== 0) return areaCompare;
      return productName(a).localeCompare(productName(b), "es");
    });

  const recipeIds = filteredRecipes.map((recipe) => recipe.id);
  const productIds = filteredRecipes.map((recipe) => recipe.product_id).filter(Boolean);

  const [{ data: ingredientLineRows }, { data: stepRows }] = recipeIds.length
    ? await Promise.all([
        supabase
          .from("recipes")
          .select("product_id,ingredient_product_id,quantity")
          .in("product_id", productIds)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("recipe_steps")
          .select("id,recipe_card_id,step_number,description,tip,time_minutes,image_path")
          .in("recipe_card_id", recipeIds)
          .order("step_number", { ascending: true }),
      ])
    : [{ data: [] as IngredientLineRow[] }, { data: [] as StepRow[] }];

  const ingredientLines = (ingredientLineRows ?? []) as IngredientLineRow[];
  const ingredientProductIds = Array.from(
    new Set(
      ingredientLines
        .map((row) => String(row.ingredient_product_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const { data: ingredientProductsData } = ingredientProductIds.length
    ? await supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code,cost,image_url,catalog_image_url")
        .in("id", ingredientProductIds)
    : { data: [] as IngredientProductShape[] };

  const ingredientProductMap = new Map<string, IngredientProductShape>();
  for (const product of (ingredientProductsData ?? []) as IngredientProductShape[]) {
    ingredientProductMap.set(product.id, product);
  }

  const ingredientsByProductId = new Map<string, IngredientViewRow[]>();
  for (const line of ingredientLines) {
    const item: IngredientViewRow = {
      ...line,
      product: ingredientProductMap.get(String(line.ingredient_product_id ?? "")) ?? null,
    };
    const list = ingredientsByProductId.get(line.product_id) ?? [];
    list.push(item);
    ingredientsByProductId.set(line.product_id, list);
  }

  const stepsByRecipeId = new Map<string, StepRow[]>();
  for (const step of (stepRows ?? []) as StepRow[]) {
    const list = stepsByRecipeId.get(step.recipe_card_id) ?? [];
    list.push(step);
    stepsByRecipeId.set(step.recipe_card_id, list);
  }

  const selectedSiteName = siteFilterIsUnassigned
    ? "Sin sede"
    : selectedSiteId && !siteFilterIsUnassigned
      ? siteLabel(siteMap.get(selectedSiteId))
      : isOwnerScope
        ? "Todas las sedes"
        : "";
  const selectedAreaName =
    selectedAreaId === UNASSIGNED_AREA_ID
      ? "Sin area"
      : selectedAreaId
        ? areaLabel(areas.find((area) => area.id === selectedAreaId))
        : "Todas las areas";

  const visibleRecipeTypeText = !isManagement
    ? "publicadas"
    : selectedStatus === "draft"
      ? "borradores"
      : selectedStatus === "published"
        ? "publicadas"
        : "publicadas y borradores";

  const recipeGroups = Array.from(
    filteredRecipes.reduce((map, recipe) => {
      const area = one(recipe.areas);
      const sitePart = isOwnerScope && !selectedSiteId ? recipeSiteName(recipe) : selectedSiteName;
      const areaPart = areaLabel(area);
      const key = `${sitePart || "sede"}::${areaPart}`;
      const title = isOwnerScope && !selectedSiteId ? `${sitePart} - ${areaPart}` : areaPart;
      const subtitle = isOwnerScope && selectedSiteId ? selectedSiteName : sitePart || selectedAreaName;
      const group = map.get(key) ?? { key, title, subtitle, recipes: [] as RecipeCardRow[] };
      group.recipes.push(recipe);
      map.set(key, group);
      return map;
    }, new Map<string, RecipeGroup>()).values()
  );

  const backHref = recipeBookHref({
    siteId: selectedSiteId,
    areaId: selectedAreaId,
    recipeId: requestedRecipeId,
    qty: Number.isFinite(requestedQty) && requestedQty > 0 ? requestedQty : null,
    status: selectedStatus,
    q: searchTerm,
  });

  const filterSummary = [selectedSiteName, selectedAreaName, visibleRecipeTypeText, searchTerm ? `busqueda: ${searchTerm}` : null]
    .filter(Boolean)
    .join(" - ");

  const generated = generatedDate();

  return (
    <>
      <RecipeBookPdfActions backHref={backHref} />
      <style>{`
        :root {
          color: #1f1916;
          background: #f7f2ee;
        }
        .pdf-shell {
          min-height: 100vh;
          background:
            radial-gradient(circle at 18% 0%, rgba(249, 115, 22, 0.16), transparent 28%),
            linear-gradient(135deg, #fff7ed 0%, #ffffff 48%, #f7f2ee 100%);
          color: #1f1916;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .pdf-page {
          width: min(1120px, calc(100% - 32px));
          margin: 0 auto;
          padding: 32px 0 52px;
        }
        .hero {
          position: relative;
          overflow: hidden;
          border: 1px solid #ead8c8;
          border-radius: 34px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: 0 18px 52px rgba(67, 39, 24, 0.10);
          padding: 36px;
        }
        .hero::after {
          content: "";
          position: absolute;
          inset: auto -80px -120px auto;
          width: 280px;
          height: 280px;
          border-radius: 999px;
          background: rgba(249, 115, 22, 0.16);
        }
        .logo {
          width: 180px;
          height: auto;
        }
        .eyebrow {
          display: inline-flex;
          border-radius: 999px;
          background: #fff7ed;
          color: #c2410c;
          border: 1px solid #fed7aa;
          padding: 6px 12px;
          font-size: 11px;
          letter-spacing: .14em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .title {
          margin-top: 24px;
          max-width: 820px;
          font-size: 54px;
          line-height: 0.94;
          letter-spacing: -0.05em;
          font-weight: 820;
        }
        .subtitle {
          margin-top: 18px;
          max-width: 740px;
          color: #6b625d;
          font-size: 17px;
          line-height: 1.65;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 28px;
        }
        .stat-card, .card {
          border: 1px solid #ead8c8;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.92);
          padding: 18px;
        }
        .stat-label, .section-kicker {
          color: #c2410c;
          font-size: 11px;
          letter-spacing: .12em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .stat-value {
          margin-top: 6px;
          font-size: 24px;
          font-weight: 760;
          color: #1f1916;
        }
        .toc {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .chapter {
          break-inside: avoid;
          page-break-inside: avoid;
          margin-top: 34px;
        }
        .chapter-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid #ead8c8;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }
        .chapter-title {
          margin-top: 4px;
          font-size: 30px;
          letter-spacing: -0.03em;
          font-weight: 780;
        }
        .recipe-card {
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
          border: 1px solid #e6d4c2;
          border-radius: 32px;
          background: #fffdfb;
          box-shadow: 0 16px 44px rgba(67, 39, 24, 0.08);
          margin-top: 18px;
        }
        .recipe-cover {
          min-height: 250px;
          background: #fff7ed center / cover no-repeat;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c2410c;
          font-size: 56px;
          font-weight: 800;
        }
        .recipe-body {
          padding: 26px;
        }
        .recipe-title-row {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          justify-content: space-between;
        }
        .recipe-title {
          margin-top: 6px;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -0.04em;
          font-weight: 800;
        }
        .recipe-description {
          margin-top: 10px;
          color: #6b625d;
          line-height: 1.62;
          max-width: 760px;
        }
        .badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .badge {
          display: inline-flex;
          border-radius: 999px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 750;
        }
        .recipe-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 20px;
        }
        .metric {
          border: 1px solid #ead8c8;
          border-radius: 20px;
          background: #fbfcfd;
          padding: 14px;
        }
        .metric-label {
          color: #8b817a;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .1em;
        }
        .metric-value {
          margin-top: 5px;
          font-size: 17px;
          line-height: 1.25;
          font-weight: 760;
        }
        .section-block {
          margin-top: 24px;
        }
        .section-title {
          margin-top: 2px;
          font-size: 22px;
          font-weight: 780;
          letter-spacing: -0.02em;
        }
        .ingredients-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 8px;
          margin-top: 12px;
        }
        .ingredients-table th {
          text-align: left;
          color: #8b817a;
          font-size: 10px;
          letter-spacing: .1em;
          text-transform: uppercase;
          padding: 0 12px;
        }
        .ingredients-table td {
          background: #fbfcfd;
          border-top: 1px solid #ead8c8;
          border-bottom: 1px solid #ead8c8;
          padding: 12px;
          vertical-align: middle;
        }
        .ingredients-table td:first-child {
          border-left: 1px solid #ead8c8;
          border-top-left-radius: 18px;
          border-bottom-left-radius: 18px;
        }
        .ingredients-table td:last-child {
          border-right: 1px solid #ead8c8;
          border-top-right-radius: 18px;
          border-bottom-right-radius: 18px;
          text-align: right;
          font-weight: 800;
        }
        .ingredient-thumb {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          background: #fff7ed center / cover no-repeat;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #c2410c;
          font-weight: 800;
          margin-right: 10px;
          vertical-align: middle;
        }
        .steps {
          display: grid;
          gap: 14px;
          margin-top: 12px;
        }
        .step {
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
          display: grid;
          grid-template-columns: 240px 1fr;
          border: 1px solid #e6d4c2;
          border-radius: 24px;
          background: #fffdfb;
        }
        .step-image {
          min-height: 190px;
          background: #fff7ed center / cover no-repeat;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c2410c;
          font-weight: 800;
        }
        .step-content {
          padding: 20px;
        }
        .step-head {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .step-number {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f97316;
          color: white;
          font-size: 18px;
          font-weight: 820;
        }
        .step-time {
          border: 1px solid #fed7aa;
          border-radius: 999px;
          background: #fff7ed;
          color: #c2410c;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 760;
        }
        .step-description {
          margin-top: 14px;
          color: #1f1916;
          font-size: 16px;
          line-height: 1.65;
        }
        .step-tip {
          margin-top: 12px;
          border: 1px solid #fed7aa;
          border-radius: 16px;
          background: #fff7ed;
          color: #9a3412;
          padding: 12px;
          font-size: 14px;
          line-height: 1.55;
          font-weight: 700;
        }
        .process-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .process-note {
          margin-top: 10px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 18px;
          padding: 14px;
          line-height: 1.5;
          font-weight: 680;
        }
        .footer-note {
          color: #8b817a;
          font-size: 12px;
          margin-top: 28px;
          text-align: center;
        }
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          :root, body {
            background: #ffffff !important;
          }
          .pdf-shell {
            background: #ffffff !important;
          }
          .pdf-page {
            width: 100%;
            padding: 0;
          }
          .hero, .card, .recipe-card, .metric, .step, .ingredients-table td {
            box-shadow: none !important;
          }
          .hero {
            min-height: 82vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .chapter {
            page-break-before: always;
          }
          .recipe-card {
            page-break-before: auto;
          }
          .recipe-cover {
            min-height: 180px;
          }
          .recipe-grid, .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .step {
            grid-template-columns: 180px 1fr;
          }
          .step-image {
            min-height: 150px;
          }
          .process-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .title {
            font-size: 46px;
          }
        }
      `}</style>

      <div className="pdf-shell">
        <main className="pdf-page">
          <section className="hero">
            <img src={LOGO_SRC} alt="Vento Group" className="logo" />
            <div className="eyebrow">FOGO - Recetario operacional</div>
            <h1 className="title">Libro de recetas Vento Group</h1>
            <p className="subtitle">
              Fichas de produccion con ingredientes, rendimiento, porciones, parametros operativos,
              empaque y paso a paso visual. Las fotos aparecen solo cuando la receta las tiene cargadas.
            </p>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Recetas</div>
                <div className="stat-value">{filteredRecipes.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Capitulos</div>
                <div className="stat-value">{recipeGroups.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Filtro</div>
                <div className="stat-value" style={{ fontSize: 16 }}>{filterSummary || "General"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Generado</div>
                <div className="stat-value" style={{ fontSize: 16 }}>{generated}</div>
              </div>
            </div>
          </section>

          {filteredRecipes.length === 0 ? (
            <section className="card" style={{ marginTop: 24 }}>
              <div className="section-kicker">Sin resultados</div>
              <h2 className="section-title">No hay recetas visibles con estos filtros.</h2>
            </section>
          ) : (
            <section className="card" style={{ marginTop: 24 }}>
              <div className="section-kicker">Indice</div>
              <h2 className="section-title">Capitulos del recetario</h2>
              <div className="toc">
                {recipeGroups.map((group) => (
                  <div key={group.key} className="metric">
                    <div className="metric-label">{group.subtitle}</div>
                    <div className="metric-value">{group.title}</div>
                    <div style={{ marginTop: 5, color: "#8b817a", fontSize: 13 }}>
                      {group.recipes.length} recetas
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recipeGroups.map((group) => (
            <section key={group.key} className="chapter">
              <div className="chapter-header">
                <div>
                  <div className="section-kicker">Capitulo</div>
                  <h2 className="chapter-title">{group.title}</h2>
                </div>
                <div className="badge">{group.recipes.length} recetas</div>
              </div>

              {group.recipes.map((recipe) => {
                const product = one(recipe.products);
                const area = one(recipe.areas);
                const recipeSteps = stepsByRecipeId.get(recipe.id) ?? [];
                const firstStepImage = recipeSteps.find((step) => step.image_path)?.image_path ?? "";
                const coverImage = imageUrl(recipe) || firstStepImage;
                const recipeIngredients = ingredientsByProductId.get(recipe.product_id) ?? [];
                const productionQty = requestedRecipeId && Number.isFinite(requestedQty) && requestedQty > 0
                  ? requestedQty
                  : Number(recipe.yield_qty ?? 0) || 1;
                const scaleFactor = Number(recipe.yield_qty) > 0 ? productionQty / Number(recipe.yield_qty) : 1;
                const portionSize = Number(recipe.portion_size ?? 0);
                const portionUnit = recipe.portion_unit || recipe.yield_unit || product?.unit || "un";
                const portionCalc = calculatePortions({
                  totalQty: productionQty,
                  totalUnit: recipe.yield_unit,
                  portionQty: portionSize,
                  portionUnit,
                });
                const totalMinutes = recipeSteps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
                const totalCost = recipeIngredients.reduce((acc, row) => {
                  const qty = Number(row.quantity ?? 0) * scaleFactor;
                  const cost = Number(row.product?.cost ?? 0);
                  return acc + (Number.isFinite(qty * cost) ? qty * cost : 0);
                }, 0);
                const config = processConfig(recipe);
                const hasProcess =
                  config.vacuumPackaging ||
                  config.controlledCook ||
                  config.specialStorage ||
                  config.specialLabeling ||
                  config.processNotes ||
                  config.labelNotes;

                return (
                  <article key={recipe.id} className="recipe-card">
                    <div
                      className="recipe-cover"
                      style={coverImage ? { backgroundImage: `url("${coverImage}")` } : undefined}
                    >
                      {!coverImage ? String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R" : null}
                    </div>
                    <div className="recipe-body">
                      <div className="recipe-title-row">
                        <div>
                          <div className="section-kicker">Ficha de produccion</div>
                          <h2 className="recipe-title">{product?.name ?? "Receta"}</h2>
                          <p className="recipe-description">
                            {recipe.recipe_description || "Receta operacional para produccion estandarizada en FOGO."}
                          </p>
                          <div className="badge-row">
                            <span className="badge">{recipe.site_id ? recipeSiteName(recipe) : selectedSiteName}</span>
                            <span className="badge">{areaLabel(area)}</span>
                            <span className="badge">{statusLabel(recipe.status)}</span>
                            {config.vacuumPackaging ? <span className="badge">Empaque al vacio</span> : null}
                          </div>
                        </div>
                      </div>

                      <div className="recipe-grid">
                        <div className="metric">
                          <div className="metric-label">Rendimiento</div>
                          <div className="metric-value">{fmt(productionQty)} {recipe.yield_unit}</div>
                          <div style={{ marginTop: 5, color: "#8b817a", fontSize: 12 }}>Base: {fmt(recipe.yield_qty)} {recipe.yield_unit}</div>
                        </div>
                        <div className="metric">
                          <div className="metric-label">Porciones</div>
                          <div className="metric-value">
                            {portionCalc.count != null
                              ? `${fmt(portionCalc.count, 1)} de ${fmt(portionSize)} ${portionUnit}`
                              : "Sin configurar"}
                          </div>
                        </div>
                        <div className="metric">
                          <div className="metric-label">Tiempo</div>
                          <div className="metric-value">
                            {recipe.prep_time_minutes
                              ? `${fmt(recipe.prep_time_minutes, 0)} min`
                              : totalMinutes > 0
                                ? `${fmt(totalMinutes, 0)} min`
                                : "-"}
                          </div>
                        </div>
                        <div className="metric">
                          <div className="metric-label">Vida util / dificultad</div>
                          <div className="metric-value">
                            {recipe.shelf_life_days ? `${fmt(recipe.shelf_life_days, 0)} dias` : "-"} - {difficultyLabel(recipe.difficulty)}
                          </div>
                        </div>
                      </div>

                      {recipeIngredients.length > 0 ? (
                        <section className="section-block">
                          <div className="section-kicker">1. Alistar</div>
                          <h3 className="section-title">Ingredientes</h3>
                          <table className="ingredients-table">
                            <thead>
                              <tr>
                                <th>Ingrediente</th>
                                <th>SKU</th>
                                {isManagement ? <th>Costo ref.</th> : null}
                                <th>Cantidad</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recipeIngredients.map((row, index) => {
                                const ingredientProduct = row.product;
                                const thumb = productImage(ingredientProduct);
                                const requiredQty = Number(row.quantity ?? 0) * scaleFactor;
                                const unit = ingredientProduct?.stock_unit_code || ingredientProduct?.unit || "-";
                                return (
                                  <tr key={`${recipe.id}-${row.ingredient_product_id}-${index}`}>
                                    <td>
                                      <span
                                        className="ingredient-thumb"
                                        style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                                      >
                                        {!thumb ? index + 1 : null}
                                      </span>
                                      <span>{ingredientProduct?.name ?? "Ingrediente"}</span>
                                    </td>
                                    <td>{ingredientProduct?.sku ?? "-"}</td>
                                    {isManagement ? <td>{money(ingredientProduct?.cost)}</td> : null}
                                    <td>{fmt(requiredQty, 3)} {unit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {isManagement ? (
                            <div className="process-note">Costo estimado de esta escala: {money(totalCost)}</div>
                          ) : null}
                        </section>
                      ) : null}

                      {hasProcess ? (
                        <section className="section-block">
                          <div className="section-kicker">2. Parametros</div>
                          <h3 className="section-title">Proceso, empaque y conservacion</h3>
                          <div className="process-grid">
                            {config.vacuumPackaging ? (
                              <div className="metric">
                                <div className="metric-label">Empaque al vacio</div>
                                <div className="metric-value">{config.packagingMethod || "Activo"}</div>
                                <div style={{ marginTop: 6, color: "#6b625d", fontSize: 13 }}>
                                  Bolsa: {config.bagType || "-"}<br />
                                  Vacio: {config.vacuumLevel || "-"}<br />
                                  Sellado: {config.sealRange || "-"}<br />
                                  Unid./empaque: {fieldValue(config.unitsPerPack)}
                                </div>
                              </div>
                            ) : null}
                            {config.controlledCook ? (
                              <div className="metric">
                                <div className="metric-label">Coccion controlada</div>
                                <div className="metric-value">{config.cookEquipment || "Equipo pendiente"}</div>
                                <div style={{ marginTop: 6, color: "#6b625d", fontSize: 13 }}>
                                  Temperatura: {fieldValue(config.cookTemperatureC, " C")}<br />
                                  Tiempo: {fieldValue(config.cookTimeMinutes, " min")}<br />
                                  Temp. interna: {fieldValue(config.targetInternalTempC, " C")}
                                </div>
                              </div>
                            ) : null}
                            {config.specialStorage ? (
                              <div className="metric">
                                <div className="metric-label">Conservacion</div>
                                <div className="metric-value">{config.storageCondition || "Especial"}</div>
                                <div style={{ marginTop: 6, color: "#6b625d", fontSize: 13 }}>
                                  Temperatura: {fieldValue(config.storageTemperatureC, " C")}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {config.labelNotes ? <div className="process-note">Etiqueta: {config.labelNotes}</div> : null}
                          {config.processNotes ? <div className="process-note">Nota operativa: {config.processNotes}</div> : null}
                        </section>
                      ) : null}

                      <section className="section-block">
                        <div className="section-kicker">3. Preparar</div>
                        <h3 className="section-title">Paso a paso</h3>
                        <div className="steps">
                          {recipeSteps.length > 0 ? (
                            recipeSteps.map((step) => (
                              <article key={step.id} className="step">
                                <div
                                  className="step-image"
                                  style={step.image_path ? { backgroundImage: `url("${step.image_path}")` } : undefined}
                                >
                                  {!step.image_path ? "Sin foto" : null}
                                </div>
                                <div className="step-content">
                                  <div className="step-head">
                                    <span className="step-number">{step.step_number}</span>
                                    {step.time_minutes != null ? (
                                      <span className="step-time">{fmt(step.time_minutes, 0)} min</span>
                                    ) : null}
                                  </div>
                                  <p className="step-description">{step.description}</p>
                                  {step.tip ? <div className="step-tip">{step.tip}</div> : null}
                                </div>
                              </article>
                            ))
                          ) : (
                            <div className="metric">Esta receta aun no tiene pasos guardados.</div>
                          )}
                        </div>
                      </section>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}

          <div className="footer-note">
            Vento Group - FOGO Recipe Book - Documento generado desde Vento OS el {generated}.
          </div>
        </main>
      </div>
    </>
  );
}
