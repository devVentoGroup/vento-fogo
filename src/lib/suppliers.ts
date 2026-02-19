import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ROLES_CAN_MANAGE_SUPPLIERS = [
  "propietario",
  "gerente_general",
  "gerente",
] as const;

export async function requireCanManageSuppliers(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = (data?.role as string) ?? "";
  if (!ROLES_CAN_MANAGE_SUPPLIERS.includes(role as (typeof ROLES_CAN_MANAGE_SUPPLIERS)[number])) {
    redirect("/suppliers?error=no_permission");
  }
}
