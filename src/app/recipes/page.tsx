import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

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
  updated_at?: string | null;
  products?: Relation<ProductShape>;
  areas?: Relation<AreaShape>;
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

function normalizeSlug(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function statusClass(value: string | null | undefined) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "archived") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]";
}

function difficultyLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Simple";
  if (normalized === "facil") return "Facil";
  if (normalized === "medio") return "Media";
  if (normalized === "dificil") return "Dificil";
  return value;
}

function editRecipeHref(recipe: RecipeCardRow) {
  const qs = new URLSearchParams();
  if (recipe.site_id) qs.set("site_id", recipe.site_id);
  if (recipe.area_id) qs.set("area_id", recipe.area_id);
  qs.set("product_id", recipe.product_id);
  return `/recipes/new?${qs.toString()}`;
}

function newRecipeHref(params: { siteId?: string | null; areaId?: string | null }) {
  const qs = new URLSearchParams();
  if (params.siteId && params.siteId !== UNASSIGNED_SITE_ID) qs.set("site_id", params.siteId);
  if (params.areaId && params.areaId !== UNASSIGNED_AREA_ID) qs.set("area_id", params.areaId);
  const query = qs.toString();
  return query ? `/recipes/new?${query}` : "/recipes/new";
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

export default async function RecipesAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    area_id?: string;
    status?: string;
    q?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();
  const requestedAreaId = String(sp.area_id ?? "").trim();
  const requestedStatus = String(sp.status ?? "all").trim().toLowerCase();
  const searchTerm = String(sp.q ?? "").trim();
  const saved = String(sp.saved ?? "").trim() === "1";
  const error = String(sp.error ?? "").trim();
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

  const areaMap = new Map<string, AreaShape>();
  for (const recipe of recipeRows) {
    const area = one(recipe.areas);
    if (area?.id && !areaMap.has(area.id)) areaMap.set(area.id, area);
  }

  const siteOptions = Array.from(
    new Map(
      recipeRows
        .map((recipe) => {
          if (!recipe.site_id) return null;
          const site = siteMap.get(recipe.site_id) ?? {
            id: recipe.site_id,
            name: "Sede",
            site_type: null,
          };
          return [site.id, site] as const;
        })
        .filter((value): value is readonly [string, SiteShape] => Boolean(value))
    ).values()
  ).sort((a, b) => siteLabel(a).localeCompare(siteLabel(b), "es"));

  const areaOptions = Array.from(areaMap.values()).sort((a, b) =>
    areaLabel(a).localeCompare(areaLabel(b), "es")
  );

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
      const aArea = areaLabel(one(a.areas));
      const bArea = areaLabel(one(b.areas));
      const areaCompare = aArea.localeCompare(bArea, "es");
      if (areaCompare !== 0) return areaCompare;
      return productName(a).localeCompare(productName(b), "es");
    });

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

  const statusCounts = recipeRows.reduce(
    (acc, recipe) => {
      const status = String(recipe.status ?? "").toLowerCase();
      if (status === "published") acc.published += 1;
      else if (status === "archived") acc.archived += 1;
      else acc.draft += 1;
      return acc;
    },
    { published: 0, draft: 0, archived: 0 }
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[linear-gradient(135deg,#FFF7ED_0%,#FFFFFF_58%,#FFFBF5_100%)] p-5 shadow-[var(--ui-shadow-soft)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#C2410C] shadow-sm">
              Administracion FOGO
            </span>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-[var(--ui-text)] md:text-5xl">
              Recetas
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-[var(--ui-muted)]">
              Gestiona fichas tecnicas, ingredientes, pasos operativos, rendimiento y estado de publicacion.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/recipe-book" className="ui-btn ui-btn--ghost ui-btn--sm">
              Ver libro operacional
            </Link>
            <Link href={newRecipeHref({ siteId: requestedSiteId, areaId: requestedAreaId })} className="ui-btn ui-btn--brand ui-btn--sm">
              Nueva receta
            </Link>
          </div>
        </div>

        {saved ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            Receta guardada correctamente.
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm font-semibold text-[#C2410C]">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)]">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-[#FED7AA] bg-[#FFF7ED] p-4">
            <div className="text-xs font-semibold uppercase text-[#C2410C]">Total</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{recipeRows.length}</div>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase text-emerald-700">Publicadas</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{statusCounts.published}</div>
          </div>
          <div className="rounded-3xl border border-[#FED7AA] bg-[#FFFBF5] p-4">
            <div className="text-xs font-semibold uppercase text-[#C2410C]">Borradores</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{statusCounts.draft}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase text-slate-600">Archivadas</div>
            <div className="mt-1 text-3xl font-semibold text-[var(--ui-text)]">{statusCounts.archived}</div>
          </div>
        </div>

        <form className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_minmax(180px,1fr)_auto_auto]">
          <label>
            <span className="ui-label">Sede</span>
            <select name="site_id" defaultValue={requestedSiteId} className="ui-input mt-1 bg-white">
              <option value="">Todas las sedes</option>
              <option value={UNASSIGNED_SITE_ID}>Sin sede</option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {siteLabel(site)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="ui-label">Area</span>
            <select name="area_id" defaultValue={requestedAreaId} className="ui-input mt-1 bg-white">
              <option value="">Todas las areas</option>
              <option value={UNASSIGNED_AREA_ID}>Sin area</option>
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {areaLabel(area)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="ui-label">Estado</span>
            <select name="status" defaultValue={selectedStatus} className="ui-input mt-1 bg-white">
              <option value="all">Todas</option>
              <option value="published">Publicadas</option>
              <option value="draft">Borradores</option>
              <option value="archived">Archivadas</option>
            </select>
          </label>

          <label>
            <span className="ui-label">Buscar</span>
            <input className="ui-input mt-1 bg-white" name="q" placeholder="Nombre, SKU, sede, area..." defaultValue={searchTerm} />
          </label>

          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand ui-btn--sm w-full">
              Aplicar
            </button>
          </div>
          <div className="flex items-end">
            <Link href="/recipes" className="ui-btn ui-btn--ghost ui-btn--sm w-full">
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      {recipes.length === 0 ? (
        <section className="rounded-[var(--ui-radius-card)] border border-[#FED7AA] bg-[#FFF7ED] p-8 text-center shadow-[var(--ui-shadow-soft)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-3xl text-[#F97316]">✦</div>
          <h2 className="mt-4 text-2xl font-semibold text-[var(--ui-text)]">No hay recetas con estos filtros</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
            Limpia la busqueda o crea una nueva receta desde administracion.
          </p>
          <Link href={newRecipeHref({ siteId: requestedSiteId, areaId: requestedAreaId })} className="ui-btn ui-btn--brand ui-btn--sm mt-5">
            Nueva receta
          </Link>
        </section>
      ) : (
        <section className="space-y-5">
          {recipeGroups.map((group) => (
            <div key={group.key} className="rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-white p-4 shadow-[var(--ui-shadow-soft)] md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-[#C2410C]">Grupo</div>
                  <h2 className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{group.title}</h2>
                </div>
                <span className="ui-chip ui-chip--brand">{group.recipes.length} recetas</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {group.recipes.map((recipe) => {
                  const product = one(recipe.products);
                  const area = one(recipe.areas);
                  const site = recipe.site_id ? siteMap.get(recipe.site_id) : null;
                  const thumb = productImage(recipe);
                  return (
                    <article key={recipe.id} className="rounded-3xl border border-[var(--ui-border)] bg-[#FFFDFC] p-3 shadow-[var(--ui-shadow-soft)]">
                      <div className="grid grid-cols-[84px_1fr] gap-3">
                        <div
                          className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-2xl bg-[#FFF7ED] bg-cover bg-center text-2xl font-semibold text-[#F97316]"
                          style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                        >
                          {!thumb ? String(product?.name ?? "R").trim().charAt(0).toUpperCase() || "R" : null}
                        </div>

                        <div className="min-w-0">
                          <div className="line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">
                            {product?.name ?? "Producto"}
                          </div>
                          <div className="mt-1 text-xs text-[var(--ui-muted)]">{product?.sku ?? "Sin SKU"}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(recipe.status)}`}>
                              {statusLabel(recipe.status)}
                            </span>
                            {!recipe.is_active ? (
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                Inactiva
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-3">
                          <div className="text-xs font-semibold uppercase text-[#C2410C]">Rendimiento</div>
                          <div className="mt-1 font-semibold text-[var(--ui-text)]">{fmt(recipe.yield_qty)} {recipe.yield_unit}</div>
                        </div>
                        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-[var(--ui-muted)]">Porcion</div>
                          <div className="mt-1 font-semibold text-[var(--ui-text)]">
                            {recipe.portion_size ? `${fmt(recipe.portion_size)} ${recipe.portion_unit ?? recipe.yield_unit}` : "Pendiente"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs leading-5 text-[var(--ui-muted)]">
                        {siteLabel(site)} · {areaLabel(area)} · {difficultyLabel(recipe.difficulty)}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={editRecipeHref(recipe)} className="ui-btn ui-btn--brand ui-btn--sm flex-1">
                          Editar
                        </Link>
                        <Link href={`/recipe-book?recipe_id=${encodeURIComponent(recipe.id)}`} className="ui-btn ui-btn--ghost ui-btn--sm flex-1">
                          Ver ficha
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
