"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const recipeProductSet = useMemo(() => new Set(recipeCards.map((card) => card.product_id)), [recipeCards]);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const productDropdownRef = useRef<HTMLDivElement | null>(null);
  const [productDropdownRect, setProductDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === initialProductId) ?? null,
    [products, initialProductId]
  );

  const selectedProductLabel = useMemo(() => {
    if (!selectedProduct) return "";
    const hasRecipe = recipeProductSet.has(selectedProduct.id);
    return `${selectedProduct.name ?? "Producto"} (${selectedProduct.sku ?? "-"}) - ${selectedProduct.product_type ?? "n/a"}${hasRecipe ? " - con receta" : ""}`;
  }, [selectedProduct, recipeProductSet]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => {
      const label = `${product.name ?? "Producto"} ${product.sku ?? ""} ${product.product_type ?? ""}`.toLowerCase();
      return label.includes(query);
    });
  }, [products, productSearch]);

  const updateProductDropdownPosition = () => {
    const node = productInputRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setProductDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    setProductSearch(selectedProductLabel);
  }, [selectedProductLabel]);

  useEffect(() => {
    if (!openProductSearch) return;
    updateProductDropdownPosition();
    const onResizeOrScroll = () => updateProductDropdownPosition();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (productInputRef.current && target && productInputRef.current.contains(target)) return;
      if (productDropdownRef.current && target && productDropdownRef.current.contains(target)) return;
      setOpenProductSearch(false);
      setProductSearch(selectedProductLabel);
    };
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openProductSearch, selectedProductLabel]);

  const navigate = (nextSiteId: string, nextProductId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const target = buildUrl(pathname || "/recipes/new", params, nextSiteId, nextProductId, source || "fogo");
    setIsNavigating(true);
    window.location.assign(target);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="ui-label">Sede de receta</span>
        <select
          name="site_id"
          value={initialSiteId}
          onChange={(event) => {
            const nextSiteId = event.target.value;
            navigate(nextSiteId, initialProductId);
          }}
          className="ui-input"
          disabled={isNavigating}
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
        <input type="hidden" name="product_id" value={initialProductId} />
        <div className="relative">
          <input
            ref={productInputRef}
            type="text"
            value={productSearch}
            onFocus={() => {
              setOpenProductSearch(true);
              window.requestAnimationFrame(() => updateProductDropdownPosition());
            }}
            onChange={(event) => {
              setProductSearch(event.target.value);
              setOpenProductSearch(true);
              window.requestAnimationFrame(() => updateProductDropdownPosition());
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setProductSearch(selectedProductLabel);
              }, 120);
            }}
            className="ui-input"
            required
            disabled={isNavigating}
            placeholder="Buscar producto por nombre, SKU o tipo..."
          />
        </div>
        <span className="text-xs text-[var(--ui-muted)]">
          Al cambiar producto se recarga la ficha para evitar mezclar ingredientes/pasos de otra receta.
        </span>
      </label>

      {typeof document !== "undefined" && openProductSearch && productDropdownRect
        ? createPortal(
            <div
              ref={productDropdownRef}
              className="z-[99999] max-h-64 overflow-auto rounded-lg border border-[var(--ui-border)] bg-white shadow-2xl"
              style={{
                position: "fixed",
                top: productDropdownRect.top,
                left: productDropdownRect.left,
                width: productDropdownRect.width,
              }}
            >
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const hasRecipe = recipeProductSet.has(product.id);
                  const label = `${product.name ?? "Producto"} (${product.sku ?? "-"}) - ${product.product_type ?? "n/a"}${hasRecipe ? " - con receta" : ""}`;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setProductSearch(label);
                        setOpenProductSearch(false);
                        if (product.id !== initialProductId) {
                          navigate(initialSiteId, product.id);
                        }
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--ui-panel-soft)]"
                    >
                      {label}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-sm text-[var(--ui-muted)]">Sin coincidencias</div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
