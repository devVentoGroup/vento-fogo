"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

type FocusProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  unit: string | null;
};

type IngredientStats = {
  product_id: string;
  lines: number;
  qty: number;
};

type StepStats = {
  recipe_card_id: string;
  count: number;
};

type RecipesLiveManagerProps = {
  siteId: string;
  productId: string;
  source: string;
  created: boolean;
  saved: boolean;
  error: string;
  initialSearchTerm: string;
  initialProductType: string;
  initialAreaId: string;
  recipeCards: RecipeCardRow[];
  areaOptions: AreaShape[];
  ingredientStats: IngredientStats[];
  stepStats: StepStats[];
  focusedProduct: FocusProductRow | null;
  existingRecipeForFocusedProduct: { id: string; status: string; site_id: string | null } | null;
  hasFocusedRecipeCard: boolean;
  nexoBaseUrl: string;
  fogoBaseUrl: string;
};

function asDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function qty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(Number(value));
}

function resolveProduct(value: ProductShape | ProductShape[] | null | undefined): ProductShape | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function resolveArea(value: AreaShape | AreaShape[] | null | undefined): AreaShape | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function productTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "preparacion") return "Preparacion";
  if (normalized === "venta") return "Producto terminado";
  return normalized || "Sin tipo";
}

function buildRecipeNewUrl(params: {
  productId?: string;
  siteId?: string;
  source?: string;
  fogoBaseUrl: string;
}) {
  const url = new URL("/recipes/new", params.fogoBaseUrl);
  if (params.productId) url.searchParams.set("product_id", params.productId);
  if (params.siteId) url.searchParams.set("site_id", params.siteId);
  if (params.source) url.searchParams.set("source", params.source);
  return url.toString();
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function RecipesLiveManager({
  siteId,
  productId,
  source,
  created,
  saved,
  error,
  initialSearchTerm,
  initialProductType,
  initialAreaId,
  recipeCards,
  areaOptions,
  ingredientStats,
  stepStats,
  focusedProduct,
  existingRecipeForFocusedProduct,
  hasFocusedRecipeCard,
  nexoBaseUrl,
  fogoBaseUrl,
}: RecipesLiveManagerProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [productTypeFilter, setProductTypeFilter] = useState(initialProductType);
  const [areaFilter, setAreaFilter] = useState(initialAreaId);

  const ingredientByProduct = useMemo(
    () => new Map(ingredientStats.map((row) => [row.product_id, { lines: row.lines, qty: row.qty }])),
    [ingredientStats]
  );

  const stepsByCard = useMemo(
    () => new Map(stepStats.map((row) => [row.recipe_card_id, row.count])),
    [stepStats]
  );

  const filteredRecipeCards = useMemo(() => {
    const searchNeedle = normalizeSearch(searchTerm);

    return recipeCards.filter((row) => {
      const product = resolveProduct(row.products);
      const area = resolveArea(row.areas);
      const productType = String(product?.product_type ?? "").trim().toLowerCase();

      if (productTypeFilter && productType !== productTypeFilter) return false;
      if (areaFilter && row.area_id !== areaFilter) return false;
      if (!searchNeedle) return true;

      const haystack = normalizeSearch(
        [
          product?.name,
          product?.sku,
          product?.unit,
          productTypeLabel(product?.product_type),
          area?.name,
          area?.kind,
          row.status,
          row.yield_unit,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return haystack.includes(searchNeedle);
    });
  }, [areaFilter, productTypeFilter, recipeCards, searchTerm]);

  const published = filteredRecipeCards.filter((recipe) => recipe.status === "published").length;
  const draft = filteredRecipeCards.filter((recipe) => recipe.status === "draft").length;
  const hasActiveFilters = Boolean(searchTerm.trim() || productTypeFilter || areaFilter);

  const clearFilters = () => {
    setSearchTerm("");
    setProductTypeFilter("");
    setAreaFilter("");
  };

  return (
    <div className="space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="ui-h1">Recetas</h1>
          <Link
            href={siteId ? `/recipes/new?site_id=${encodeURIComponent(siteId)}` : "/recipes/new"}
            className="ui-btn ui-btn--brand ui-btn--sm"
          >
            Crear receta
          </Link>
        </div>

        <p className="mt-2 ui-body-muted">
          Recetario operativo (BOM + pasos). Aqui puedes auditar estado, ingredientes y pasos por producto.
        </p>

        {created ? (
          <div className="mt-3 ui-alert ui-alert--success">
            Receta creada en borrador. Continua en FOGO para completar ingredientes y pasos.
          </div>
        ) : null}

        {saved ? <div className="mt-3 ui-alert ui-alert--success">Receta guardada correctamente.</div> : null}
        {error ? <div className="mt-3 ui-alert ui-alert--warn">{error}</div> : null}

        {productId && focusedProduct ? (
          <div className="mt-3 ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
            <p>
              Producto foco desde {source === "nexo" ? "NEXO" : "enlace externo"}:
              <strong className="ml-1 text-[var(--ui-text)]">{focusedProduct.name ?? "Producto"}</strong>
              <span className="ml-1">({focusedProduct.sku ?? "-"})</span>
            </p>

            {existingRecipeForFocusedProduct ? (
              <p className="mt-1">
                Ya existe una receta ({existingRecipeForFocusedProduct.status}). Puedes editarla en esta vista.
              </p>
            ) : (
              <div className="mt-2">
                <a
                  href={buildRecipeNewUrl({
                    productId,
                    siteId,
                    source: source || "nexo",
                    fogoBaseUrl,
                  })}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  Crear receta para este producto
                </a>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="ui-panel-soft">
            <div className="ui-label">Total recetas</div>
            <div className="mt-1 ui-h2">{filteredRecipeCards.length}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Publicadas</div>
            <div className="mt-1 ui-h2">{published}</div>
          </div>
          <div className="ui-panel-soft">
            <div className="ui-label">Borrador</div>
            <div className="mt-1 ui-h2">{draft}</div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="ui-h2">Listado de recetas</h2>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              El listado se actualiza automaticamente mientras escribes.
            </p>
          </div>
          <a
            href={`${nexoBaseUrl}/inventory/catalog`}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            target="_blank"
            rel="noreferrer"
          >
            Abrir catalogo en NEXO
          </a>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_240px_auto] lg:items-end">
          <label className="min-w-[260px] flex-1">
            <span className="ui-label">Buscar por nombre</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ej: galleta, pulled pork, cebolla..."
              className="ui-input"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label>
            <span className="ui-label">Tipo</span>
            <select
              value={productTypeFilter}
              onChange={(event) => setProductTypeFilter(event.target.value)}
              className="ui-input"
            >
              <option value="">Todos</option>
              <option value="preparacion">Preparaciones</option>
              <option value="venta">Productos terminados</option>
            </select>
          </label>

          <label>
            <span className="ui-label">Area asignada</span>
            <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="ui-input">
              <option value="">Todas las areas</option>
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name ?? area.kind ?? area.id}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            disabled={!hasActiveFilters}
          >
            Limpiar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table min-w-[1120px]">
            <thead>
              <tr>
                <th className="ui-th">Producto</th>
                <th className="ui-th">SKU</th>
                <th className="ui-th">Tipo</th>
                <th className="ui-th">Area</th>
                <th className="ui-th">Rendimiento</th>
                <th className="ui-th">Ingredientes</th>
                <th className="ui-th">Pasos</th>
                <th className="ui-th">Estado</th>
                <th className="ui-th">Actualizado</th>
                <th className="ui-th">Accion</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipeCards.map((row) => {
                const ingredient = ingredientByProduct.get(row.product_id) ?? { lines: 0, qty: 0 };
                const steps = row.id.startsWith("legacy:") ? 0 : (stepsByCard.get(row.id) ?? 0);
                const product = resolveProduct(row.products);
                const area = resolveArea(row.areas);
                const productName = product?.name || "Producto";
                const sku = product?.sku || "-";

                return (
                  <tr key={row.id}>
                    <td className="ui-td">{productName}</td>
                    <td className="ui-td">{sku}</td>
                    <td className="ui-td">{productTypeLabel(product?.product_type)}</td>
                    <td className="ui-td">
                      {area ? (
                        <span className="ui-chip ui-chip--brand">{area.name ?? area.kind ?? "Area"}</span>
                      ) : (
                        <span className="text-[var(--ui-muted)]">Sin area</span>
                      )}
                    </td>
                    <td className="ui-td">
                      {qty(row.yield_qty)} {row.yield_unit}
                    </td>
                    <td className="ui-td">{ingredient.lines} lineas</td>
                    <td className="ui-td">{steps}</td>
                    <td className="ui-td">
                      <span className={`ui-chip ${row.status === "published" ? "ui-chip--success" : "ui-chip--warn"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="ui-td">{asDate(row.updated_at)}</td>
                    <td className="ui-td">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="ui-btn ui-btn--ghost ui-btn--sm"
                          href={`/recipes/new?product_id=${encodeURIComponent(row.product_id)}${
                            siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""
                          }${row.area_id ? `&area_id=${encodeURIComponent(row.area_id)}` : ""}`}
                        >
                          Editar ficha
                        </Link>
                        <Link className="ui-btn ui-btn--ghost ui-btn--sm" href="/production-batches">
                          Ver lotes
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRecipeCards.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={10}>
                    {searchTerm.trim()
                      ? "No hay recetas que coincidan con esa busqueda."
                      : hasFocusedRecipeCard
                        ? "No se encontro la receta en la sede activa. Cambia de sede para verla."
                        : "No hay recetas para la sede activa."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
