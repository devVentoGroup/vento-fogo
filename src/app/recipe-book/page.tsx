import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

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
  status: string;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
};

type IngredientLineRow = {
  ingredient_product_id: string;
  quantity: number | null;
};

type IngredientViewRow = IngredientLineRow & {
  product: IngredientProductShape | null;
};

type StepRow = {
  id: string;
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

function imageUrl(recipe: RecipeCardRow | null) {
  if (!recipe) return "";
  const product = one(recipe.products);
  return recipe.cover_image_path || product?.catalog_image_url || product?.image_url || "";
}

function productImage(product: ProductShape | null | undefined) {
  return product?.catalog_image_url || product?.image_url || "";
}

function productName(recipe: RecipeCardRow | null) {
  return one(recipe?.products)?.name || "Receta sin nombre";
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

function recipeHref(params: {
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

export default async function RecipeBookPage({
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
    returnTo: "/recipe-book",
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
          "id,product_id,site_id,area_id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description,cover_image_path,status,products(id,name,sku,unit,stock_unit_code,image_url,catalog_image_url),areas(id,code,name,kind,site_id)"
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
  const hasAnyRecipe = rawRecipes.length > 0;

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
  const siteScopedRecipesForStatus = searchScopedRecipes.filter(recipeMatchesSite);
  const statusScopedRecipesForSite = searchScopedRecipes.filter(recipeMatchesStatus);
  const allRecipes = siteScopedRecipesForStatus.filter(recipeMatchesStatus);

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

  const recipeCountByArea = new Map<string, number>();
  let recipesWithoutAreaCount = 0;
  for (const recipe of allRecipes) {
    const areaId = String(recipe.area_id ?? "");
    if (!areaId) {
      recipesWithoutAreaCount += 1;
      continue;
    }
    recipeCountByArea.set(areaId, (recipeCountByArea.get(areaId) ?? 0) + 1);
  }

  const recipeCountBySite = new Map<string, number>();
  let recipesWithoutSiteCount = 0;
  for (const recipe of statusScopedRecipesForSite) {
    const recipeSiteId = String(recipe.site_id ?? "");
    if (!recipeSiteId) {
      recipesWithoutSiteCount += 1;
      continue;
    }
    recipeCountBySite.set(recipeSiteId, (recipeCountBySite.get(recipeSiteId) ?? 0) + 1);
  }

  const requestedAreaIsValid =
    requestedAreaId === UNASSIGNED_AREA_ID || areas.some((area) => area.id === requestedAreaId);
  const selectedAreaId = isManagement
    ? (requestedAreaIsValid ? requestedAreaId : "")
    : (currentAreaId || "");

  const recipes = allRecipes
    .filter((recipe) => {
      if (selectedAreaId === UNASSIGNED_AREA_ID) return !recipe.area_id;
      return selectedAreaId ? recipe.area_id === selectedAreaId : true;
    })
    .sort((a, b) => {
      if (isOwnerScope && !selectedSiteId) {
        const siteCompare = recipeSiteName(a).localeCompare(recipeSiteName(b), "es");
        if (siteCompare !== 0) return siteCompare;
      }
      const areaCompare = areaLabel(one(a.areas)).localeCompare(areaLabel(one(b.areas)), "es");
      if (areaCompare !== 0) return areaCompare;
      return productName(a).localeCompare(productName(b), "es");
    });

  const selectedRecipe = requestedRecipeId
    ? recipes.find((recipe) => recipe.id === requestedRecipeId) ?? null
    : null;
  const selectedProduct = one(selectedRecipe?.products);
  const selectedArea = one(selectedRecipe?.areas) ?? areas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedRecipeIsDraft = isDraftStatus(selectedRecipe?.status);
  const selectedRecipeIsPublished = isPublishedStatus(selectedRecipe?.status);
  const productionQty =
    selectedRecipe && Number.isFinite(requestedQty) && requestedQty > 0
      ? requestedQty
      : Number(selectedRecipe?.yield_qty ?? 0) || 1;
  const scaleFactor =
    selectedRecipe && Number(selectedRecipe.yield_qty) > 0
      ? productionQty / Number(selectedRecipe.yield_qty)
      : 1;

  const permissionSiteId = selectedRecipe?.site_id || (!isOwnerScope ? selectedSiteId : currentSiteId);
  const permissionAreaId = selectedRecipe?.area_id || (selectedAreaId && selectedAreaId !== UNASSIGNED_AREA_ID ? selectedAreaId : null);
  const canCreateBatch =
    selectedRecipe && selectedRecipeIsPublished
      ? await checkPermission(supabase, APP_ID, "production.batches.create", {
          siteId: permissionSiteId,
          areaId: permissionAreaId,
        })
      : false;

  const [{ data: ingredientLineRows }, { data: stepRows }] = selectedRecipe
    ? await Promise.all([
        supabase
          .from("recipes")
          .select("ingredient_product_id,quantity")
          .eq("product_id", selectedRecipe.product_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("recipe_steps")
          .select("id,step_number,description,tip,time_minutes,image_path")
          .eq("recipe_card_id", selectedRecipe.id)
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

  const ingredients: IngredientViewRow[] = ingredientLines.map((row) => ({
    ...row,
    product: ingredientProductMap.get(String(row.ingredient_product_id ?? "")) ?? null,
  }));
  const steps = (stepRows ?? []) as StepRow[];
  const totalCost = ingredients.reduce((acc, row) => {
    const qty = Number(row.quantity ?? 0) * scaleFactor;
    const cost = Number(row.product?.cost ?? 0);
    return acc + (Number.isFinite(qty * cost) ? qty * cost : 0);
  }, 0);

  const firstStepImage = steps.find((step) => step.image_path)?.image_path ?? "";
  const coverImage = imageUrl(selectedRecipe) || firstStepImage;
  const selectedSite =
    isOwnerScope && selectedRecipe?.site_id
      ? siteMap.get(selectedRecipe.site_id) ?? null
      : isOwnerScope && selectedSiteId && !siteFilterIsUnassigned
        ? siteMap.get(selectedSiteId) ?? null
        : null;
  const selectedSiteName = siteFilterIsUnassigned
    ? "Sin sede"
    : selectedRecipe?.site_id
      ? siteLabel(siteMap.get(selectedRecipe.site_id))
      : selectedSite
        ? siteLabel(selectedSite)
        : isOwnerScope
          ? "Todas las sedes"
          : "";
  const selectedAreaName =
    selectedAreaId === UNASSIGNED_AREA_ID
      ? "Sin area"
      : selectedRecipe?.area_id
        ? areaLabel(one(selectedRecipe.areas))
        : selectedArea
          ? areaLabel(selectedArea)
          : selectedAreaId
            ? "Area"
            : "Todas las areas";

  const baseYield = `${fmt(selectedRecipe?.yield_qty)} ${selectedRecipe?.yield_unit ?? "-"}`;
  const targetYield = `${fmt(productionQty)} ${selectedRecipe?.yield_unit ?? selectedProduct?.unit ?? "-"}`;
  const totalMinutes = steps.reduce((acc, step) => acc + Number(step.time_minutes ?? 0), 0);
  const visibleRecipeTypeText = !isManagement
    ? "publicadas"
    : selectedStatus === "draft"
      ? "borradores"
      : selectedStatus === "published"
        ? "publicadas"
        : "publicadas y borradores";
  const portionSize = Number(selectedRecipe?.portion_size ?? 0);
  const portionUnit = selectedRecipe?.portion_unit || selectedRecipe?.yield_unit || selectedProduct?.unit || "un";
  const portionUnitMatchesYield =
    normalizeUnit(portionUnit) && normalizeUnit(portionUnit) === normalizeUnit(selectedRecipe?.yield_unit);
  const estimatedPortions =
    selectedRecipe && portionSize > 0 && Number.isFinite(productionQty / portionSize)
      ? productionQty / portionSize
      : null;
  const portionText =
    estimatedPortions != null
      ? `${fmt(estimatedPortions, 1)} porciones de ${fmt(portionSize)} ${portionUnit}`
      : "Porciones sin configurar";
  const basePortionText =
    selectedRecipe && portionSize > 0
      ? `${fmt(selectedRecipe.yield_qty / portionSize, 1)} porciones base`
      : "Porcion pendiente";
  const showPortionWarning = Boolean(
    estimatedPortions != null &&
      selectedRecipe?.yield_unit &&
      portionUnit &&
      !portionUnitMatchesYield
  );

  const recipeGroups = Array.from(
    recipes.reduce((map, recipe) => {
      const area = one(recipe.areas);
      const sitePart = isOwnerScope && !selectedSiteId ? recipeSiteName(recipe) : selectedSiteName;
      const areaPart = areaLabel(area);
      const key = `${sitePart || "sede"}::${areaPart}`;
      const title = isOwnerScope && !selectedSiteId ? `${sitePart} · ${areaPart}` : areaPart;
      const subtitle = isOwnerScope && selectedSiteId ? selectedSiteName : sitePart || selectedAreaName;
      const group = map.get(key) ?? { key, title, subtitle, recipes: [] as RecipeCardRow[] };
      group.recipes.push(recipe);
      map.set(key, group);
      return map;
    }, new Map<string, RecipeGroup>()).values()
  );

  const filterResetHref = recipeHref({});
  const selectedFilterSummary = [
    isOwnerScope ? selectedSiteName : null,
    selectedAreaName,
    visibleRecipeTypeText,
    searchTerm ? `busqueda: ${searchTerm}` : null,
  ].filter(Boolean).join(" · ");

  const renderRecipeCard = (recipe: RecipeCardRow, compact = false) => {
    const product = one(recipe.products);
    const area = one(recipe.areas);
    const thumb = imageUrl(recipe);
    const active = recipe.id === selectedRecipe?.id;
    const isDraft = isDraftStatus(recipe.status);
    const recipeSite = recipe.site_id ? siteMap.get(recipe.site_id) ?? null : null;
    const qtyForLink = selectedRecipe ? productionQty : null;
    return (
      <Link
        key={recipe.id}
        href={recipeHref({
          siteId: selectedSiteId,
          areaId: selectedAreaId,
          recipeId: recipe.id,
          qty: qtyForLink,
          status: selectedStatus,
          q: searchTerm,
        })}
        className={`group grid gap-3 rounded-3xl border bg-white/90 p-3 transition hover:-translate-y-0.5 hover:border-[#FDBA74] hover:bg-[#FFFDFC] hover:shadow-[var(--ui-shadow-soft)] ${
          compact ? "grid-cols-[72px_1fr]" : "grid-cols-[86px_1fr]"
        } ${active ? "border-[#F97316] bg-[#FFF7ED] shadow-[var(--ui-shadow-soft)]" : "border-[var(--ui-border)]"}`}
      >
        <div
          className={`${compact ? "h-[72px]" : "h-[86px]"} overflow-hidden rounded-2xl bg-[#FFF7ED] bg-cover bg-center`}
          style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
        >
          {!thumb ? (
            <div className="flex h-full items-center justify-center text-2xl font-semibold text-[#F97316]">
              {String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R"}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 py-1">
          <div className="line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">
            {product?.name ?? "Producto"}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--ui-muted)]">
            {isOwnerScope ? `${siteLabel(recipeSite)} · ${areaLabel(area)}` : areaLabel(area)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex rounded-full bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#C2410C]">
              {fmt(recipe.yield_qty)} {recipe.yield_unit}
            </span>
            {recipe.portion_size ? (
              <span className="inline-flex rounded-full bg-[#FFFBF5] px-2.5 py-1 text-xs font-semibold text-[#9A3412]">
                {fmt(recipe.portion_size)} {recipe.portion_unit ?? recipe.yield_unit}/porc.
              </span>
            ) : null}
            {isManagement && isDraft ? (
              <span className="inline-flex rounded-full border border-[#FDBA74] bg-[#FFEDD5] px-2.5 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                Borrador
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    );
  };

  if (!hasAnyRecipe) {
    return (
      <div className="space-y-6">
        <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-6 shadow-[var(--ui-shadow-soft)] md:p-8">
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
            Recetario FOGO
          </span>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[var(--ui-text)] md:text-5xl">
            No hay recetas visibles
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--ui-muted)]">
            Cuando una receta este disponible para tu rol, aparecera aqui como ficha visual para producirla paso a paso.
          </p>
          {isManagement ? (
            <Link href="/recipes" className="ui-btn ui-btn--brand ui-btn--sm mt-5">
              Ir a recetas
            </Link>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[linear-gradient(135deg,#FFF7ED_0%,#FFFFFF_54%,#FFFBF5_100%)] p-4 shadow-[var(--ui-shadow-soft)] md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex gap-4">
            <div
              className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-[#FED7AA] bg-[#FFF7ED] bg-cover bg-center shadow-[var(--ui-shadow-soft)] sm:block"
              style={coverImage ? { backgroundImage: `url("${coverImage}")` } : undefined}
            >
              {!coverImage ? (
                <div className="flex h-full items-center justify-center text-4xl font-semibold text-[#F97316]">
                  {selectedRecipe ? String(selectedProduct?.name ?? "R").trim().charAt(0).toUpperCase() || "R" : "✦"}
                </div>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C] shadow-sm">
                  Recetario FOGO
                </span>
                {isOwnerScope ? (
                  <span className="rounded-full border border-[#FED7AA] bg-white/80 px-3 py-1 text-xs font-semibold text-[#9A3412]">
                    {selectedSiteName}
                  </span>
                ) : null}
                <span className="rounded-full border border-[#FED7AA] bg-white/80 px-3 py-1 text-xs font-semibold text-[#9A3412]">
                  {selectedAreaName}
                </span>
                <span className="rounded-full border border-[#FED7AA] bg-white/80 px-3 py-1 text-xs font-semibold text-[#9A3412]">
                  {recipes.length} recetas {visibleRecipeTypeText}
                </span>
                {isManagement && selectedRecipeIsDraft ? (
                  <span className="rounded-full border border-[#FDBA74] bg-[#FFEDD5] px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                    Borrador
                  </span>
                ) : null}
              </div>

              <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight text-[var(--ui-text)] md:text-5xl">
                {selectedRecipe ? selectedProduct?.name ?? "Receta" : "Libro de recetas FOGO"}
              </h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-[var(--ui-muted)]">
                {selectedRecipe
                  ? selectedRecipe.recipe_description || "Ficha visual de produccion con ingredientes escalados y pasos faciles de seguir."
                  : "Explora el recetario por sede y area. Abre una ficha para ver ingredientes, porciones y preparacion."}
              </p>

              {isManagement && selectedRecipeIsDraft ? (
                <div className="mt-3 max-w-3xl rounded-2xl border border-[#FED7AA] bg-white/80 px-4 py-3 text-sm font-semibold leading-6 text-[#C2410C]">
                  Esta receta esta en borrador. Puedes revisarla, pero no se puede producir hasta publicarla.
                </div>
              ) : null}
            </div>
          </div>

          {selectedRecipe ? (
            <aside className="rounded-3xl border border-[#FED7AA] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Produccion</div>
              <form className="mt-3 space-y-3">
                {selectedSiteId ? <input type="hidden" name="site_id" value={selectedSiteId} /> : null}
                {selectedAreaId ? <input type="hidden" name="area_id" value={selectedAreaId} /> : null}
                {selectedStatus !== "all" ? <input type="hidden" name="status" value={selectedStatus} /> : null}
                {searchTerm ? <input type="hidden" name="q" value={searchTerm} /> : null}
                <input type="hidden" name="recipe_id" value={selectedRecipe.id} />

                <label>
                  <span className="ui-label">
                    Cantidad a preparar ({selectedRecipe.yield_unit ?? selectedProduct?.unit ?? "un"})
                  </span>
                  <input
                    className="ui-input mt-1 bg-white text-2xl font-semibold"
                    type="number"
                    min="0.01"
                    step="0.01"
                    name="qty"
                    defaultValue={productionQty}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm">
                    Recalcular
                  </button>
                  {canCreateBatch && selectedRecipeIsPublished ? (
                    <Link
                      href={`/production-batches/new?recipe_id=${encodeURIComponent(selectedRecipe.id)}&qty=${encodeURIComponent(String(productionQty))}`}
                      className="ui-btn ui-btn--primary ui-btn--sm"
                    >
                      Producir
                    </Link>
                  ) : (
                    <span className="ui-btn ui-btn--ghost ui-btn--sm pointer-events-none opacity-70">
                      {selectedRecipeIsDraft ? "Borrador" : "Solo lectura"}
                    </span>
                  )}
                </div>
              </form>
            </aside>
          ) : (
            <aside className="rounded-3xl border border-[#FED7AA] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Vista actual</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-3">
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">Recetas</div>
                  <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{recipes.length}</div>
                </div>
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[#FBFCFD] p-3">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Capitulos</div>
                  <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{recipeGroups.length}</div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ui-muted)]">
                {selectedFilterSummary}. Selecciona una ficha para abrir su preparacion.
              </p>
            </aside>
          )}
        </div>
      </section>

      <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="ui-h2">Filtros</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Usa sede, area, estado o busqueda. Los resultados se ordenan por area y alfabeto.
            </p>
          </div>
          {isManagement ? (
            <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm">
              Admin recetas
            </Link>
          ) : null}
        </div>

        <form className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1.2fr_1fr_minmax(180px,1fr)_auto_auto]">
          {isOwnerScope ? (
            <label>
              <span className="ui-label">Sede</span>
              <select name="site_id" defaultValue={selectedSiteId} className="ui-input mt-1 bg-white">
                <option value="">Todas las sedes ({statusScopedRecipesForSite.length})</option>
                {recipesWithoutSiteCount > 0 ? (
                  <option value={UNASSIGNED_SITE_ID}>Sin sede ({recipesWithoutSiteCount})</option>
                ) : null}
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {siteLabel(site)} ({recipeCountBySite.get(site.id) ?? 0})
                  </option>
                ))}
              </select>
            </label>
          ) : selectedSiteId ? (
            <input type="hidden" name="site_id" value={selectedSiteId} />
          ) : null}

          {isManagement ? (
            <label>
              <span className="ui-label">Area</span>
              <select name="area_id" defaultValue={selectedAreaId} className="ui-input mt-1 bg-white">
                <option value="">Todas las areas ({allRecipes.length})</option>
                {recipesWithoutAreaCount > 0 ? (
                  <option value={UNASSIGNED_AREA_ID}>Sin area ({recipesWithoutAreaCount})</option>
                ) : null}
                {areas.map((area) => {
                  const optionSite = isOwnerScope && !selectedSiteId && area.site_id
                    ? `${siteLabel(siteMap.get(area.site_id))} · `
                    : "";
                  return (
                    <option key={area.id} value={area.id}>
                      {optionSite}{areaLabel(area)} ({recipeCountByArea.get(area.id) ?? 0})
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}

          {isManagement ? (
            <label>
              <span className="ui-label">Estado</span>
              <select name="status" defaultValue={selectedStatus} className="ui-input mt-1 bg-white">
                <option value="all">Todas ({siteScopedRecipesForStatus.length})</option>
                <option value="published">
                  Publicadas ({siteScopedRecipesForStatus.filter((recipe) => isPublishedStatus(recipe.status)).length})
                </option>
                <option value="draft">
                  Borradores ({siteScopedRecipesForStatus.filter((recipe) => isDraftStatus(recipe.status)).length})
                </option>
              </select>
            </label>
          ) : null}

          <label>
            <span className="ui-label">Buscar</span>
            <input
              className="ui-input mt-1 bg-white"
              name="q"
              placeholder="Nombre, SKU, area..."
              defaultValue={searchTerm}
            />
          </label>

          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm w-full">
              Aplicar
            </button>
          </div>
          <div className="flex items-end">
            <Link href={filterResetHref} className="ui-btn ui-btn--ghost ui-btn--sm w-full">
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      {recipes.length === 0 ? (
        <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-6 text-center shadow-[var(--ui-shadow-soft)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl text-[#F97316]">✦</div>
          <h2 className="mt-4 text-2xl font-semibold text-[var(--ui-text)]">No hay recetas con estos filtros</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
            Prueba con otra sede, otra area, otro estado o limpia la busqueda.
          </p>
        </section>
      ) : selectedRecipe ? (
        <section className="grid gap-5 xl:grid-cols-[340px_1fr]">
          <aside className="xl:sticky xl:top-24 xl:h-fit">
            <div className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="ui-h2">Indice</h2>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">Recetas ordenadas por capitulo.</p>
                </div>
                <span className="ui-chip ui-chip--brand">{recipes.length}</span>
              </div>
              <div className="mt-4 max-h-[calc(100vh-220px)] space-y-4 overflow-y-auto pr-1">
                {recipeGroups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#C2410C]">
                      <span>✦</span>
                      <span className="truncate">{group.title}</span>
                    </div>
                    <div className="grid gap-2">
                      {group.recipes.map((recipe) => renderRecipeCard(recipe, true))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <main className="space-y-5">
            <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">Ficha de produccion</div>
                  <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{selectedProduct?.name ?? "Receta"}</h2>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    {isOwnerScope ? `${selectedSiteName} · ` : ""}{selectedAreaName} · {statusLabel(selectedRecipe.status)}
                  </p>
                </div>
                <Link
                  href={recipeHref({ siteId: selectedSiteId, areaId: selectedAreaId, status: selectedStatus, q: searchTerm })}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  Cerrar ficha
                </Link>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-3xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">Resultado</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{targetYield}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">Base: {baseYield}</div>
                </div>
                <div className="rounded-3xl border border-[var(--ui-border)] bg-[#FBFCFD] p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Porciones</div>
                  <div className="mt-1 text-base font-semibold leading-5 text-[var(--ui-text)]">{portionText}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">{basePortionText}</div>
                </div>
                <div className="rounded-3xl border border-[var(--ui-border)] bg-[#FBFCFD] p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Tiempo</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                    {selectedRecipe.prep_time_minutes
                      ? `${fmt(selectedRecipe.prep_time_minutes, 0)} min`
                      : totalMinutes > 0
                        ? `${fmt(totalMinutes, 0)} min`
                        : "-"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">{difficultyLabel(selectedRecipe.difficulty)}</div>
                </div>
                <div className="rounded-3xl border border-[var(--ui-border)] bg-[#FBFCFD] p-4">
                  <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Estado</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{statusLabel(selectedRecipe.status)}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">{selectedRecipeIsPublished ? "Lista para producir" : "Solo revision"}</div>
                </div>
              </div>

              {showPortionWarning ? (
                <div className="mt-4 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-3 text-sm font-semibold leading-6 text-[#C2410C]">
                  Revisa unidades: el rendimiento esta en {selectedRecipe.yield_unit} y la porcion en {portionUnit}.
                </div>
              ) : null}
            </section>

            <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">1. Alistar</div>
                  <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Ingredientes</h2>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Cantidades calculadas para {targetYield}{estimatedPortions != null ? ` (${portionText})` : ""}.
                  </p>
                </div>
                {isManagement && ingredients.length > 0 ? (
                  <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-right">
                    <div className="text-xs font-semibold uppercase text-[#C2410C]">Costo estimado</div>
                    <div className="text-xl font-semibold text-[var(--ui-text)]">{money(totalCost)}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {ingredients.map((row, index) => {
                  const product = row.product;
                  const thumb = productImage(product);
                  const requiredQty = Number(row.quantity ?? 0) * scaleFactor;
                  const unit = product?.stock_unit_code || product?.unit || "-";
                  return (
                    <div
                      key={`${row.ingredient_product_id}-${index}`}
                      className="grid grid-cols-[68px_1fr_auto] items-center gap-3 rounded-3xl border border-[var(--ui-border)] bg-[#FBFCFD] p-3"
                    >
                      <div
                        className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-[#FFF7ED] bg-cover bg-center text-lg font-semibold text-[#F97316]"
                        style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                      >
                        {!thumb ? index + 1 : null}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">
                          {product?.name ?? "Ingrediente"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-semibold text-[var(--ui-text)]">{fmt(requiredQty, 3)}</div>
                        <div className="text-xs font-semibold text-[#C2410C]">{unit}</div>
                      </div>
                    </div>
                  );
                })}
                {ingredients.length === 0 ? (
                  <div className="ui-empty md:col-span-2">
                    No hay ingredientes guardados para esta receta. Si acabas de editarlos, guarda la receta y vuelve a abrir el recetario.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-1)] md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">2. Preparar</div>
                  <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Paso a paso</h2>
                </div>
                <span className="ui-chip">{steps.length} pasos</span>
              </div>
              <div className="mt-6 space-y-4">
                {steps.map((step) => (
                  <article
                    key={step.id}
                    className="overflow-hidden rounded-3xl border border-[#E5D6C5] bg-[#FFFDFC] shadow-[var(--ui-shadow-soft)]"
                  >
                    <div className="grid md:grid-cols-[300px_1fr]">
                      <div
                        className="min-h-[220px] bg-[#FFF7ED] bg-cover bg-center"
                        style={step.image_path ? { backgroundImage: `url("${step.image_path}")` } : undefined}
                      >
                        {!step.image_path ? (
                          <div className="flex h-full min-h-[220px] items-center justify-center text-base font-semibold text-[#C2410C]">
                            Foto pendiente
                          </div>
                        ) : null}
                      </div>
                      <div className="p-6 md:p-7">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316] text-xl font-semibold text-white">
                            {step.step_number}
                          </span>
                          {step.time_minutes != null ? (
                            <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-sm font-semibold text-[#C2410C]">
                              {fmt(step.time_minutes, 0)} min
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-5 text-xl leading-9 text-[var(--ui-text)]">{step.description}</p>
                        {step.tip ? (
                          <p className="mt-5 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4 text-base font-semibold leading-7 text-[#C2410C]">
                            {step.tip}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
                {steps.length === 0 ? (
                  <div className="ui-empty">Esta receta aun no tiene pasos guardados.</div>
                ) : null}
              </div>
            </section>
          </main>
        </section>
      ) : (
        <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-soft)] md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Indice del libro</div>
              <h2 className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">Elige una receta</h2>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Organizado por capitulos. Dentro de cada capitulo, las recetas estan en orden alfabetico.
              </p>
            </div>
            <span className="ui-chip ui-chip--brand">{recipes.length} recetas</span>
          </div>

          <div className="mt-5 space-y-6">
            {recipeGroups.map((group) => (
              <section key={group.key} className="rounded-3xl border border-[#FDE7D1] bg-[#FFFDFC] p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-[#C2410C]">Capitulo</div>
                    <h3 className="mt-1 text-xl font-semibold text-[var(--ui-text)]">{group.title}</h3>
                    <p className="mt-1 text-sm text-[var(--ui-muted)]">{group.recipes.length} recetas</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF7ED] text-2xl text-[#F97316]">✦</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {group.recipes.map((recipe) => renderRecipeCard(recipe))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
