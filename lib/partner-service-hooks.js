import {
  createPartnerCommissionForService,
  createPartnerServiceCommission,
  createPartnerServiceCommissionByEmail,
} from "./partner-commission-engine";
import {
  parseSubscriptionPrice,
  registerPartnerService,
  resolveSubscriptionServiceType,
} from "./partner-commission-config";

export { registerPartnerService };

async function resolveReferredUserIdByEmail(supabase, email, fallbackUsername) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile?.id) {
    return profile;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    throw authError;
  }

  const authUser = (authData?.users || []).find(
    (user) => String(user.email || "").trim().toLowerCase() === normalizedEmail
  );

  if (!authUser?.id) {
    return null;
  }

  const username =
    String(fallbackUsername || "").trim() ||
    String(authUser.user_metadata?.username || "").trim() ||
    normalizedEmail.split("@")[0] ||
    "مستخدم";

  const { data: syncedProfile, error: syncError } = await supabase
    .from("profiles")
    .upsert({
      id: authUser.id,
      email: normalizedEmail,
      username,
      role: "user",
    })
    .select("id, username")
    .single();

  if (syncError) {
    throw syncError;
  }

  return syncedProfile;
}

async function safePartnerHook(label, runner) {
  try {
    return await runner();
  } catch (error) {
    console.error(`PARTNER_HOOK_${label}_FAILED`);
    return { created: false, reason: "hook_failed" };
  }
}

export async function onPartnerSubscriptionActivated(supabase, { subscriptionRequestId }) {
  return safePartnerHook("SUBSCRIPTION", async () => {
    const requestId = String(subscriptionRequestId || "").trim();

    if (!requestId) {
      return { created: false, reason: "missing_subscription_id" };
    }

    const { data: subscription, error } = await supabase
      .from("subscription_requests")
      .select("id, user_email, username, plan_name, category, price, status")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!subscription?.id || subscription.status !== "مفعل") {
      return { created: false, reason: "subscription_not_active" };
    }

    const serviceType = resolveSubscriptionServiceType(
      subscription.category,
      subscription.plan_name
    );

    const profile = await resolveReferredUserIdByEmail(
      supabase,
      subscription.user_email,
      subscription.username
    );

    if (!profile?.id) {
      return { created: false, reason: "user_not_found" };
    }

    return createPartnerCommissionForService(supabase, {
      referredUserId: profile.id,
      serviceType,
      sourceId: String(subscription.id),
      baseAmount: parseSubscriptionPrice(subscription.price),
      reason:
        serviceType === "vip_spot" ? "VIP Spot Subscription" : "VIP Signal subscription approved",
      invitedUsername: subscription.username,
      metadata: {
        planName: subscription.plan_name,
        category: subscription.category,
      },
    });
  });
}

export async function onPartnerAccountManagementActivated(
  supabase,
  { requestId, userId, userEmail, username, capital }
) {
  return safePartnerHook("ACCOUNT_MANAGEMENT", async () => {
    const normalizedRequestId = String(requestId || "").trim();
    let normalizedUserId = String(userId || "").trim();

    if (!normalizedRequestId) {
      return { created: false, reason: "missing_request_id" };
    }

    if (!normalizedUserId && userEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", String(userEmail).trim().toLowerCase())
        .maybeSingle();

      normalizedUserId = profile?.id || "";
    }

    if (!normalizedUserId) {
      return { created: false, reason: "missing_user_id" };
    }

    return createPartnerCommissionForService(supabase, {
      referredUserId: normalizedUserId,
      serviceType: "account_management",
      sourceId: normalizedRequestId,
      baseAmount: 0,
      reason: "Account Management",
      invitedUsername: username,
      metadata: { capital: capital || null },
    });
  });
}

export async function onPartnerGenericServiceActivated(
  supabase,
  {
    userId,
    userEmail,
    subscriptionId,
    serviceType,
    subscriptionPrice = 0,
    reason,
    invitedUsername,
    metadata,
  }
) {
  return safePartnerHook("GENERIC_SERVICE", async () => {
    let referredUserId = String(userId || "").trim();

    if (!referredUserId && userEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("email", String(userEmail).trim().toLowerCase())
        .maybeSingle();

      referredUserId = profile?.id || "";
    }

    if (!referredUserId) {
      return { created: false, reason: "missing_user" };
    }

    return createPartnerCommissionForService(supabase, {
      referredUserId,
      serviceType,
      sourceId: subscriptionId,
      baseAmount: parseSubscriptionPrice(subscriptionPrice),
      reason,
      invitedUsername,
      metadata,
    });
  });
}

export async function onPartnerAcademyActivated(supabase, payload) {
  return onPartnerGenericServiceActivated(supabase, {
    ...payload,
    serviceType: "academy",
    reason: payload?.reason || "Academy Subscription",
  });
}

// Backward-compatible exports for older imports.
export {
  createPartnerCommissionForService,
  createPartnerServiceCommission,
  createPartnerServiceCommissionByEmail,
};
