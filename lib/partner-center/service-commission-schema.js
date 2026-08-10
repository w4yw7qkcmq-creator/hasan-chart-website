/** Detect whether Round 8 service commission schema is deployed. */
export async function isServiceCommissionSchemaReady(supabase) {
  try {
    const { error } = await supabase
      .from("partner_service_commission_entitlements")
      .select("id", { head: true, count: "exact" })
      .limit(0);
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return false;
      }
      throw error;
    }
    return true;
  } catch {
    return false;
  }
}

export async function safeSelectActiveCommissionRules(supabase) {
  const withVersioning = await supabase
    .from("partner_commission_rules")
    .select(
      "id, service_type, commission_percent, commission_mode, fixed_amount, is_active, is_enabled, tier_policy, rule_version, display_name_ar, release_policy, notes, status"
    )
    .eq("status", "active")
    .order("service_type", { ascending: true });

  if (!withVersioning.error) {
    return withVersioning.data || [];
  }

  if (withVersioning.error.code === "42703" || withVersioning.error.message?.includes("status")) {
    const legacy = await supabase
      .from("partner_commission_rules")
      .select(
        "service_type, commission_percent, commission_mode, fixed_amount, is_active, release_policy, notes"
      )
      .order("service_type", { ascending: true });
    if (legacy.error) throw legacy.error;
    return legacy.data || [];
  }

  throw withVersioning.error;
}
