"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppSwitcher } from "./app-switcher";
import { ProfileMenu } from "./profile-menu";
import { VentoLogo } from "./vento-logo";
import { createClient } from "@/lib/supabase/client";

type SiteOption = {
  id: string;
  name: string | null;
  site_type?: string | null;
};

type IconName = "dashboard" | "book" | "flask";

type NavItem = {
  href: string;
  label: string;
  description?: string;
  required?: string[];
  icon?: IconName;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type VentoChromeProps = {
  children: React.ReactNode;
  displayName: string;
  role?: string | null;
  email?: string | null;
  sites: SiteOption[];
  activeSiteId: string;
};

const APP_ENTITY = "fogo";
const APP_NAME = "FOGO";
const APP_TAGLINE = "Recetas, produccion y lotes";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [
      {
        href: "/",
        label: "Panel",
        description: "Resumen operativo",
        required: ["access"],
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Produccion",
    items: [
      {
        href: "/recipe-book",
        label: "Recetario",
        description: "Consulta y produccion",
        required: ["production.recipe_book.view"],
        icon: "book",
      },
      {
        href: "/recipes",
        label: "Admin recetas",
        description: "BOM, pasos y medios",
        required: ["production.recipes.manage"],
        icon: "book",
      },
      {
        href: "/production-batches",
        label: "Lotes",
        description: "Consumo y salida de terminado",
        required: ["production.batches.view"],
        icon: "flask",
      },
    ],
  },
];

function Icon({ name }: { name?: IconName }) {
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 4h7v7H4z" />
          <path d="M13 4h7v5h-7z" />
          <path d="M13 11h7v9h-7z" />
          <path d="M4 13h7v7H4z" />
        </svg>
      );
    case "book":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
          <path d="M6 3v16" />
          <path d="M10 7h6" />
          <path d="M10 11h6" />
        </svg>
      );
    case "flask":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 2v5l-5.5 9.5A3 3 0 0 0 7.1 21h9.8a3 3 0 0 0 2.6-4.5L14 7V2" />
          <path d="M9 11h6" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarToggleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M9 5v14" />
    </svg>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`ui-sidebar-item ${active ? "active" : ""} ${
        collapsed ? "lg:h-10 lg:w-10 lg:items-center lg:justify-center lg:gap-0 lg:overflow-hidden lg:p-0" : ""
      }`}
    >
      <span className="ui-sidebar-item-icon">
        <Icon name={item.icon} />
      </span>
      <span className={`ui-sidebar-item-content ${collapsed ? "lg:!hidden" : ""}`}>
        <span className="ui-sidebar-item-title">{item.label}</span>
        {item.description ? <span className="ui-sidebar-item-desc">{item.description}</span> : null}
      </span>
    </Link>
  );
}

export function VentoChrome({
  children,
  displayName,
  role,
  email,
  sites,
  activeSiteId,
}: VentoChromeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("vento:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [permMap, setPermMap] = useState<Record<string, boolean>>({});
  const [permissionsReady, setPermissionsReady] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("vento:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // Persistence is optional.
    }
  }, [sidebarCollapsed]);

  const currentSiteId = searchParams.get("site_id") ?? activeSiteId ?? "";
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId),
    [sites, currentSiteId]
  );
  const currentSiteLabel = currentSite?.name ?? currentSiteId ?? "Sin sede";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const permissionCodes = useMemo(
    () => [
      "access",
      "production.recipe_book.view",
      "production.recipes.manage",
      "production.batches.view",
    ],
    []
  );

  useEffect(() => {
    let activeRequest = true;
    const supabase = createClient();
    const siteId = currentSiteId || activeSiteId || null;

    Promise.all(
      permissionCodes.map((code) =>
        supabase.rpc("has_permission", {
          p_permission_code: `fogo.${code}`,
          p_site_id: siteId,
          p_area_id: null,
        })
      )
    )
      .then((results) => {
        if (!activeRequest) return;
        const next: Record<string, boolean> = {};
        results.forEach((res, idx) => {
          next[permissionCodes[idx]] = !res.error && Boolean(res.data);
        });
        setPermMap(next);
        setPermissionsReady(true);
      })
      .catch(() => {
        if (!activeRequest) return;
        setPermMap({});
        setPermissionsReady(true);
      });

    return () => {
      activeRequest = false;
    };
  }, [activeSiteId, currentSiteId, permissionCodes]);

  const can = (code?: string) => (code ? Boolean(permMap[code]) : false);
  const visibleGroups = !permissionsReady
    ? []
    : NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items.filter((item) => (item.required?.length ? item.required.every((code) => can(code)) : true)),
      })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-black/30 transition lg:hidden ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`ui-sidebar fixed left-0 top-0 z-50 flex h-full w-72 flex-col gap-4 overflow-hidden px-4 py-5 transition-[width,padding,transform] duration-200 ease-out lg:static lg:translate-x-0 lg:shadow-none ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          } ${sidebarCollapsed ? "lg:w-16 lg:items-center lg:px-2" : "lg:w-72 lg:items-stretch lg:px-4"}`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? "lg:justify-center" : "justify-between"}`}>
            <div className={sidebarCollapsed ? "lg:hidden" : ""}>
              <VentoLogo entity="fogo" title="Vento OS" subtitle={`${APP_NAME} - Produccion`} />
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className={`hidden h-10 w-10 items-center justify-center text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] lg:inline-flex ${
                sidebarCollapsed ? "group rounded-xl" : ""
              }`}
              aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Contraer menu lateral"}
              title={sidebarCollapsed ? "Expandir menu" : "Contraer menu"}
            >
              {sidebarCollapsed ? (
                <>
                  <span className="block group-hover:hidden">
                    <VentoLogo entity={APP_ENTITY} showText={false} />
                  </span>
                  <span className="hidden group-hover:block">
                    <SidebarToggleIcon />
                  </span>
                </>
              ) : (
                <SidebarToggleIcon />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] lg:hidden"
            >
              Cerrar
            </button>
          </div>

          <div className={`rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 ${sidebarCollapsed ? "lg:!hidden" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">Sede activa</div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{currentSiteLabel}</div>
          </div>

          <nav className={`flex flex-1 flex-col gap-4 overflow-y-auto pr-1 ${sidebarCollapsed ? "lg:items-center lg:pr-0" : ""}`}>
            {!permissionsReady ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                Cargando permisos...
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                No tienes permisos visibles en esta sede.
              </div>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className={`px-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)] ${sidebarCollapsed ? "lg:!hidden" : ""}`}>{group.label}</div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        collapsed={sidebarCollapsed}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ui-header sticky top-0 z-30">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-5">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="inline-flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] h-10 px-3 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] sm:h-12 sm:px-4 sm:text-base lg:hidden"
                >
                  Menu
                </button>
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ui-surface-2)] ring-1 ring-inset ring-[var(--ui-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/logos/${APP_ENTITY}.svg`} alt={APP_NAME} className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">{APP_NAME}</span>
                    <span className="text-xs text-[var(--ui-muted)]">{APP_TAGLINE}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <AppSwitcher sites={sites} activeSiteId={activeSiteId} role={role} />
                <ProfileMenu name={displayName} role={role ?? undefined} email={email} sites={sites} />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
