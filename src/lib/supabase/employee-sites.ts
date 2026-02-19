/**
 * Normaliza filas de employee_sites con select "site_id,sites(id,name)"
 * (Supabase puede devolver sites como objeto o como array según la relación).
 */
export type EmployeeSiteRow = {
  site_id?: string;
  sites?: { id: string; name: string } | { id: string; name: string }[] | null;
};

export type SiteOption = { id: string; name: string };

export function normalizeSitesFromEmployeeSites(
  rows: EmployeeSiteRow[] | null | undefined
): SiteOption[] {
  const raw = rows ?? [];
  return raw
    .map((r) => {
      const s = Array.isArray(r.sites) ? r.sites[0] : r.sites;
      return s ? { id: s.id, name: s.name } : null;
    })
    .filter((x): x is SiteOption => x !== null);
}
