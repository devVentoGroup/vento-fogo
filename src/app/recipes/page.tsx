import { requireAppAccess } from "@/lib/auth/guard";
import { RecipesLiveManager } from "./recipes-live-manager";

export const dynamic = "force-dynamic";

const APP_ID = "fogo";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_NEXO_URL?.replace(/\/$/, "") || "https://nexo.ventogroup.co";
const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") || "https://fogo.ventogroup.co";

type ProductShape = {
  name: string | null;
  sku: string | null;
  unit: string | null;
  product_type: string | null;
};

type AreaShape = { id: string; name: string | null; kind: string | null };

type RecipeCardRow = {
  id: string;
  product_id: string;
  area_id: string | null;
  yield_qty: number;
  yield_unit: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
  products?: ProductShape | ProductShape[] | null;
  areas?: AreaShape | AreaShape[] | null;
};

type LegacyRecipeRow = {
  product_id: string;
  updated_at?: string | null;
};

type FocusProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  unit: string | null;
};

export default async function RecipesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    product_id?: string;
    source?: string;
    created?: string;
    saved?: string;
    error?: string;
    q?: string;
    product_type?: string;
    area_id?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();
  const productId = String(sp.product_id ?? "").trim();
  const source = String(sp.source ?? "").trim().toLowerCase();
  const created = String(sp.created ?? "").trim() === "1";
  const saved = String(sp.saved ?? "").trim() === "1";
  const error = String(sp.error ?? "").trim();
  const initialSearchTerm = String(sp.q ?? "").trim();
  const productTypeFilter = String(sp.product_type ?? "").trim().toLowerCase();
  const areaFilter = String(sp.area_id ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/recipes",
    permissionCode: "production.recipes.manage",
  });

  let query = supabase
    .from("recipe_cards")
    .select(
      "id,product_id,site_id,area_id,yield_qty,yield_unit,status,updated_at,products(name,sku,unit,product_type),areas(id,name,kind)"
    )
    .order("updated_at", { ascending: false })
    .limit(500);

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data: recipeCardsData } = await query;
  const recipeCards = ((recipeCardsData ?? []) as unknown[]) as RecipeCardRow[];

  // Compatibilidad: recetas antiguas que existen en "recipes" pero no tienen "recipe_cards".
  const { data: legacyRowsData } = await supabase
    .from("recipes")
    .select("product_id,updated_at")
    .eq("is_active", true)
    .limit(5000);

  const legacyRows = ((legacyRowsData ?? []) as unknown[]) as LegacyRecipeRow[];
  const cardProductIds = new Set(recipeCards.map((row) => row.product_id));
  const legacyOnlyProductIds = Array.from(
    new Set(
      legacyRows
        .map((row) => String(row.product_id ?? "").trim())
        .filter((pid) => pid && !cardProductIds.has(pid))
    )
  );

  let legacyProductMap = new Map<string, ProductShape>();
  if (legacyOnlyProductIds.length > 0) {
    const { data: legacyProductsData } = await supabase
      .from("products")
      .select("id,name,sku,unit,product_type")
      .in("id", legacyOnlyProductIds);

    legacyProductMap = new Map(
      ((legacyProductsData ?? []) as Array<{
        id: string;
        name: string | null;
        sku: string | null;
        unit: string | null;
        product_type: string | null;
      }>).map((row) => [
        row.id,
        {
          name: row.name,
          sku: row.sku,
          unit: row.unit,
          product_type: row.product_type,
        },
      ])
    );
  }

  const legacyRecipeCards: RecipeCardRow[] = legacyOnlyProductIds.map((pid) => {
    const lastUpdated =
      legacyRows
        .filter((row) => row.product_id === pid)
        .map((row) => String(row.updated_at ?? ""))
        .sort((a, b) => b.localeCompare(a))[0] || new Date(0).toISOString();

    return {
      id: `legacy:${pid}`,
      product_id: pid,
      area_id: null,
      yield_qty: 0,
      yield_unit: legacyProductMap.get(pid)?.unit ?? "-",
      status: "draft",
      updated_at: lastUpdated,
      products: legacyProductMap.get(pid) ?? null,
      areas: null,
    };
  });

  const allRecipeCards = [...recipeCards, ...legacyRecipeCards].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  );

  const focusedRecipeCard = productId
    ? recipeCards.find((row) => row.product_id === productId) ?? null
    : null;

  let focusedProduct: FocusProductRow | null = null;
  let existingRecipeForFocusedProduct: { id: string; status: string; site_id: string | null } | null = null;

  if (productId) {
    const [{ data: productData }, { data: existingCardData }] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,sku,product_type,unit")
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("recipe_cards")
        .select("id,status,site_id")
        .eq("product_id", productId)
        .maybeSingle(),
    ]);

    focusedProduct = (productData as FocusProductRow | null) ?? null;
    existingRecipeForFocusedProduct =
      (existingCardData as { id: string; status: string; site_id: string | null } | null) ?? null;
  }

  const productIds = Array.from(new Set(allRecipeCards.map((recipe) => recipe.product_id)));
  const recipeCardIds = recipeCards.map((recipe) => recipe.id);

  const [{ data: ingredientRows }, { data: stepRows }] = await Promise.all([
    productIds.length
      ? supabase
          .from("recipes")
          .select("product_id,quantity")
          .in("product_id", productIds)
          .eq("is_active", true)
      : Promise.resolve({ data: [] }),
    recipeCardIds.length
      ? supabase.from("recipe_steps").select("recipe_card_id").in("recipe_card_id", recipeCardIds)
      : Promise.resolve({ data: [] }),
  ]);

  const ingredientByProduct = new Map<string, { lines: number; qty: number }>();
  for (const row of (ingredientRows ?? []) as Array<{ product_id: string; quantity: number | null }>) {
    const current = ingredientByProduct.get(row.product_id) ?? { lines: 0, qty: 0 };
    current.lines += 1;
    current.qty += Number(row.quantity ?? 0);
    ingredientByProduct.set(row.product_id, current);
  }

  const stepsByCard = new Map<string, number>();
  for (const row of (stepRows ?? []) as Array<{ recipe_card_id: string }>) {
    stepsByCard.set(row.recipe_card_id, (stepsByCard.get(row.recipe_card_id) ?? 0) + 1);
  }

  const areaOptions = Array.from(
    new Map(
      allRecipeCards
        .map((row) => resolveArea(row.areas))
        .filter((area): area is AreaShape => Boolean(area?.id))
        .map((area) => [area.id, area])
    ).values()
  ).sort((a, b) => String(a.name ?? a.kind ?? "").localeCompare(String(b.name ?? b.kind ?? ""), "es"));

  return (
    <RecipesLiveManager
      siteId={siteId}
      productId={productId}
      source={source}
      created={created}
      saved={saved}
      error={error}
      initialSearchTerm={initialSearchTerm}
      initialProductType={productTypeFilter}
      initialAreaId={areaFilter}
      recipeCards={allRecipeCards}
      areaOptions={areaOptions}
      ingredientStats={Array.from(ingredientByProduct.entries()).map(([product_id, stats]) => ({
        product_id,
        lines: stats.lines,
        qty: stats.qty,
      }))}
      stepStats={Array.from(stepsByCard.entries()).map(([recipe_card_id, count]) => ({
        recipe_card_id,
        count,
      }))}
      focusedProduct={focusedProduct}
      existingRecipeForFocusedProduct={existingRecipeForFocusedProduct}
      hasFocusedRecipeCard={Boolean(focusedRecipeCard)}
      nexoBaseUrl={NEXO_BASE_URL}
      fogoBaseUrl={FOGO_BASE_URL}
    />
  );
}

function resolveArea(value: AreaShape | AreaShape[] | null | undefined): AreaShape | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
