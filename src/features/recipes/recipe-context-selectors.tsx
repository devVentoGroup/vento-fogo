"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SiteOption = {
  id: string;
  name: string | null;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
};

type RecipeCardLite = {
  product_id: string;
};

type Props = {
  initialSiteId: string;
  initialProductId: string;
  source: string;
  sites: SiteOption[];
  products: ProductOption[];
  recipeCards: RecipeCardLite[];
};

function buildUrl(pathname: string, params: URLSearchParams, siteId: string, productId: string, source: string) {
  if (siteId) params.set("site_id", siteId);
  else params.delete("site_id");
  if (productId) params.set("product_id", productId);
  else params.delete("product_id");
  if (source) params.set("source", source);
  else params.delete("source");
  params.delete("error");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function RecipeContextSelectors({
  initialSiteId,
  initialProductId,
  source,
  sites,
  products,
  recipeCards,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [siteId, setSiteId] = useState(initialSiteId);
  const [productId, setProductId] = useState(initialProductId);
  const recipeProductSet = useMemo(() => new Set(recipeCards.map((card) => card.product_id)), [recipeCards]);

  const navigate = (nextSiteId: string, nextProductId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const target = buildUrl(pathname || "/recipes/new", params, nextSiteId, nextProductId, source || "fogo");
    startTransition(() => {
      router.replace(target);
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="ui-label">Sede de receta</span>
        <select
          name="site_id"
          value={siteId}
          onChange={(event) => {
            const nextSiteId = event.target.value;
            setSiteId(nextSiteId);
            navigate(nextSiteId, productId);
          }}
          className="ui-input"
          disabled={isPending}
        >
          <option value="">Sin sede</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name ?? site.id}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 md:col-span-2">
        <span className="ui-label">Producto</span>
        <select
          name="product_id"
          value={productId}
          onChange={(event) => {
            const nextProductId = event.target.value;
            setProductId(nextProductId);
            navigate(siteId, nextProductId);
          }}
          className="ui-input"
          required
          disabled={isPending}
        >
          <option value="">Selecciona un producto</option>
          {products.map((product) => {
            const hasRecipe = recipeProductSet.has(product.id);
            return (
              <option key={product.id} value={product.id}>
                {product.name ?? "Producto"} ({product.sku ?? "-"}) - {product.product_type ?? "n/a"}
                {hasRecipe ? " - con receta" : ""}
              </option>
            );
          })}
        </select>
        <span className="text-xs text-[var(--ui-muted)]">
          Al cambiar producto se recarga la ficha para evitar mezclar ingredientes/pasos de otra receta.
        </span>
      </label>
    </div>
  );
}

