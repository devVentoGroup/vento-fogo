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

function storageImageUrl(supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"], value: string | null | undefined) {
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
  const keys = ["vacuum_packaging", "is_vacuum_packed", "vacuumPacked", "requires_vacuum"];
  return keys.some((key) => config[key] === true || String(config[key] ?? "").toLowerCase() === "true");
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
        const title = `${siteLabel(site)} · ${areaLabel(area)}`;
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

  return (
    <main className="min-h-screen bg-[#F7F5F2] text-[#1F1B16]">
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          body {
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-root {
            padding: 0 !important;
          }

          .recipe-sheet {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .recipe-page-break {
            break-before: page;
            page-break-before: always;
          }

          .shadow-print {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-20 border-b border-[#E8D9C8] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase text-[#C2410C]">Vista PDF administrativa</div>
            <div className="text-sm text-[#6B625A]">{recipes.length} recetas en el documento</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={recipesHref({ siteId: requestedSiteId, areaId: requestedAreaId, status: selectedStatus, q: searchTerm })} className="ui-btn ui-btn--ghost ui-btn--sm">
              Volver a administrar
            </Link>
            <PrintRecipesPdfButton />
          </div>
        </div>
      </div>

      <div className="print-root mx-auto max-w-6xl px-4 py-8">
        <section className="shadow-print overflow-hidden rounded-[32px] border border-[#E8D9C8] bg-white shadow-[var(--ui-shadow-soft)]">
          <div className="grid gap-8 bg-[linear-gradient(135deg,#FFF7ED_0%,#FFFFFF_56%,#F7F5F2_100%)] p-8 md:grid-cols-[1fr_260px] md:p-12">
            <div>
              <img src="/logos/vento-group.svg" alt="Vento Group" className="h-20 w-auto object-contain" />
              <div className="mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-[#C2410C]">
                FOGO · Recipe Book administrativo
              </div>
              <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-[#1F1B16] md:text-7xl">
                Recetario de produccion
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6B625A]">
                Documento interno con fichas tecnicas, ingredientes, parametros de rendimiento y paso a paso operativo.
              </p>
            </div>

            <aside className="rounded-[28px] border border-[#FED7AA] bg-white/90 p-5">
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Resumen</div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-4xl font-semibold">{recipes.length}</div>
                  <div className="text-sm text-[#6B625A]">recetas incluidas</div>
                </div>
                <div className="h-px bg-[#E8D9C8]" />
                <div className="text-sm leading-6 text-[#6B625A]">
                  Generado: <span className="font-semibold text-[#1F1B16]">{generatedAt}</span>
                </div>
                <div className="text-sm leading-6 text-[#6B625A]">
                  Estado: <span className="font-semibold text-[#1F1B16]">{selectedStatus === "all" ? "Todos" : statusLabel(selectedStatus)}</span>
                </div>
                {searchTerm ? (
                  <div className="text-sm leading-6 text-[#6B625A]">
                    Busqueda: <span className="font-semibold text-[#1F1B16]">{searchTerm}</span>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-[#E8D9C8] bg-white p-6 shadow-print shadow-[var(--ui-shadow-soft)]">
          <div className="text-xs font-semibold uppercase text-[#C2410C]">Indice</div>
          <h2 className="mt-1 text-3xl font-semibold">Capitulos</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recipeGroups.map((group, index) => (
              <div key={group.key} className="rounded-2xl border border-[#F2E3D3] bg-[#FFFDFC] p-4">
                <div className="text-xs font-semibold uppercase text-[#C2410C]">Capitulo {index + 1}</div>
                <div className="mt-1 text-lg font-semibold">{group.title}</div>
                <div className="mt-1 text-sm text-[#6B625A]">{group.recipes.length} recetas</div>
              </div>
            ))}
          </div>
        </section>

        {recipes.length === 0 ? (
          <section className="mt-8 rounded-[28px] border border-[#FED7AA] bg-white p-8 text-center">
            <h2 className="text-2xl font-semibold">No hay recetas para exportar</h2>
            <p className="mt-2 text-sm text-[#6B625A]">Ajusta los filtros en Administrar recetas y vuelve a generar el PDF.</p>
          </section>
        ) : null}

        {recipeGroups.map((group, groupIndex) => (
          <section key={group.key} className="recipe-page-break mt-8">
            <div className="mb-5 rounded-[28px] border border-[#FED7AA] bg-[#FFF7ED] p-6">
              <div className="text-xs font-semibold uppercase text-[#C2410C]">Capitulo {groupIndex + 1}</div>
              <h2 className="mt-1 text-4xl font-semibold">{group.title}</h2>
              <p className="mt-2 text-sm text-[#6B625A]">{group.recipes.length} recetas</p>
            </div>

            <div className="space-y-8">
              {group.recipes.map((recipe, recipeIndex) => {
                const product = one(recipe.products);
                const area = one(recipe.areas);
                const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
                const ingredients = ingredientsByProductId.get(recipe.product_id) ?? [];
                const steps = stepsByRecipeCardId.get(recipe.id) ?? [];
                const cover = productImage(recipe);
                const portionText = recipe.portion_size
                  ? `${fmt(recipe.portion_size)} ${recipe.portion_unit ?? recipe.yield_unit}`
                  : "Pendiente";
                const vacuumText = hasVacuumPackaging(recipe.process_config) ? "Si" : "No";
                const packageType =
                  configText(recipe.process_config, ["package_type", "packaging_type", "bag_type", "tipo_bolsa"]) || "Pendiente";
                const storageText =
                  configText(recipe.process_config, ["storage_condition", "storage", "conservation", "condicion_almacenamiento"]) || "Pendiente";

                return (
                  <article key={recipe.id} className={`recipe-sheet rounded-[30px] border border-[#E8D9C8] bg-white p-6 shadow-print shadow-[var(--ui-shadow-soft)] ${recipeIndex > 0 ? "mt-8" : ""}`}>
                    <header className="grid gap-5 md:grid-cols-[190px_1fr]">
                      <div className="h-[190px] overflow-hidden rounded-[26px] bg-[#FFF7ED]">
                        {cover ? (
                          <img src={cover} alt={product?.name ?? "Receta"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-5xl font-semibold text-[#F97316]">
                            {String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R"}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-xs font-semibold uppercase text-[#C2410C]">
                            {statusLabel(recipe.status)}
                          </span>
                          {!recipe.is_active ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase text-slate-600">
                              Inactiva
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-4xl font-semibold leading-tight">{product?.name ?? "Receta"}</h3>
                        <p className="mt-2 text-sm font-semibold text-[#C2410C]">{productSku(recipe)}</p>
                        <p className="mt-3 text-base leading-7 text-[#6B625A]">
                          {recipe.recipe_description || "Ficha tecnica de produccion para uso interno de Vento Group."}
                        </p>
                        <p className="mt-3 text-sm text-[#6B625A]">
                          {siteLabel(site)} · {areaLabel(area)}
                        </p>
                      </div>
                    </header>

                    <section className="mt-6 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
                        <div className="text-xs font-semibold uppercase text-[#C2410C]">Rendimiento</div>
                        <div className="mt-1 text-xl font-semibold">{fmt(recipe.yield_qty)} {recipe.yield_unit}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-[#FFFDFC] p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Porcion</div>
                        <div className="mt-1 text-xl font-semibold">{portionText}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-[#FFFDFC] p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Tiempo</div>
                        <div className="mt-1 text-xl font-semibold">{recipe.prep_time_minutes ? `${fmt(recipe.prep_time_minutes, 0)} min` : "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-[#FFFDFC] p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Vida util</div>
                        <div className="mt-1 text-xl font-semibold">{recipe.shelf_life_days ? `${fmt(recipe.shelf_life_days, 0)} dias` : "-"}</div>
                      </div>
                    </section>

                    <section className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-[#E8D9C8] bg-white p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Dificultad</div>
                        <div className="mt-1 font-semibold">{difficultyLabel(recipe.difficulty)}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-white p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Vacio</div>
                        <div className="mt-1 font-semibold">{vacuumText}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-white p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Empaque</div>
                        <div className="mt-1 font-semibold">{packageType}</div>
                      </div>
                      <div className="rounded-2xl border border-[#E8D9C8] bg-white p-4">
                        <div className="text-xs font-semibold uppercase text-[#6B625A]">Almacenamiento</div>
                        <div className="mt-1 font-semibold">{storageText}</div>
                      </div>
                    </section>

                    <section className="mt-7">
                      <div className="text-xs font-semibold uppercase text-[#C2410C]">Ingredientes</div>
                      <div className="mt-3 overflow-hidden rounded-2xl border border-[#E8D9C8]">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead className="bg-[#FFF7ED] text-xs uppercase text-[#C2410C]">
                            <tr>
                              <th className="px-4 py-3">Ingrediente</th>
                              <th className="px-4 py-3">SKU</th>
                              <th className="px-4 py-3 text-right">Cantidad</th>
                              <th className="px-4 py-3">Unidad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ingredients.length > 0 ? (
                              ingredients.map((ingredient, index) => {
                                const ingredientProduct = ingredientProductMap.get(String(ingredient.ingredient_product_id ?? ""));
                                const unit = ingredientProduct?.stock_unit_code || ingredientProduct?.unit || "-";
                                return (
                                  <tr key={`${ingredient.ingredient_product_id}-${index}`} className="border-t border-[#F2E3D3]">
                                    <td className="px-4 py-3 font-semibold">{ingredientProduct?.name ?? "Ingrediente"}</td>
                                    <td className="px-4 py-3 text-[#6B625A]">{ingredientProduct?.sku ?? "-"}</td>
                                    <td className="px-4 py-3 text-right font-semibold">{fmt(ingredient.quantity, 3)}</td>
                                    <td className="px-4 py-3 text-[#6B625A]">{unit}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={4} className="px-4 py-5 text-center text-[#6B625A]">
                                  Sin ingredientes guardados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="mt-7">
                      <div className="text-xs font-semibold uppercase text-[#C2410C]">Paso a paso</div>
                      <div className="mt-3 space-y-4">
                        {steps.length > 0 ? (
                          steps.map((step) => {
                            const image = storageImageUrl(supabase, step.image_path);
                            return (
                              <div key={step.id} className="rounded-2xl border border-[#E8D9C8] bg-[#FFFDFC] p-4">
                                <div className={image ? "grid gap-4 md:grid-cols-[180px_1fr]" : ""}>
                                  {image ? (
                                    <img src={image} alt={`Paso ${step.step_number}`} className="h-[150px] w-full rounded-xl object-cover" />
                                  ) : null}
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F97316] text-sm font-semibold text-white">
                                        {step.step_number}
                                      </span>
                                      {step.time_minutes != null ? (
                                        <span className="rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-xs font-semibold text-[#C2410C]">
                                          {fmt(step.time_minutes, 0)} min
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-3 text-base leading-7">{step.description}</p>
                                    {step.tip ? (
                                      <div className="mt-3 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-3 text-sm font-semibold leading-6 text-[#C2410C]">
                                        {step.tip}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-[#E8D9C8] bg-[#FFFDFC] p-5 text-center text-[#6B625A]">
                            Sin pasos guardados.
                          </div>
                        )}
                      </div>
                    </section>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
