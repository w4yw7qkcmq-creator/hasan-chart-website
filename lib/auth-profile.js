import { resolveUserRole } from "./admin-emails";

function getPlanAccess(subscriptionPlan) {
  const text = String(subscriptionPlan || "").toLowerCase();

  return {
    hasSpot: text.includes("spot") || text.includes("سبوت") || text.includes("vip spot"),
    hasFutures:
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures"),
  };
}

export async function buildAppUser(authUser, supabaseClient) {
  if (!authUser?.email || !supabaseClient) return null;

  let profile = null;

  try {
    const { data: profileById } = await supabaseClient
      .from("profiles")
      .select("username, telegram, role, subscription_plan, subscription_status")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileById) {
      profile = profileById;
    } else {
      const { data: profileByEmail } = await supabaseClient
        .from("profiles")
        .select("username, telegram, role, subscription_plan, subscription_status")
        .eq("email", authUser.email)
        .maybeSingle();

      profile = profileByEmail || null;
    }
  } catch (err) {
    console.warn("Profile load skipped:", err?.message || err);
  }

  let activeSubscriptions = [];

  try {
    const { data } = await supabaseClient
      .from("subscription_requests")
      .select("plan_name, category, status")
      .eq("user_email", authUser.email)
      .eq("status", "مفعل")
      .order("created_at", { ascending: false });

    activeSubscriptions = data || [];
  } catch (err) {
    console.warn("Subscription load skipped:", err?.message || err);
  }

  const activePlanNames = activeSubscriptions
    .map((item) => [item.plan_name, item.category].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");

  const planAccess = getPlanAccess(activePlanNames);
  const role = resolveUserRole(authUser.email, profile?.role);

  return {
    id: authUser.id,
    email: authUser.email,
    username:
      profile?.username ||
      authUser.user_metadata?.username ||
      authUser.email?.split("@")[0] ||
      "مستخدم",
    telegram: profile?.telegram || authUser.user_metadata?.telegram || "",
    role,
    subscription_plan:
      activePlanNames || profile?.subscription_plan || "بدون اشتراك",
    subscription_status:
      activeSubscriptions.length > 0
        ? "مفعل"
        : profile?.subscription_status || "غير نشط",
    hasSpot: planAccess.hasSpot,
    hasFutures: planAccess.hasFutures,
  };
}
