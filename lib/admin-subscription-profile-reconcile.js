function buildProfileSubscriptionPlanText(activeRows = []) {
  return activeRows
    .map((row) => [row.plan_name, row.category].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");
}

export async function fetchActiveSubscriptionRowsForUser(supabase, userEmail) {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) {
    return { email: "", rows: [], activeRows: [], error: null, missingColumns: false };
  }

  const { data: rows, error } = await supabase
    .from("subscription_requests")
    .select("id,plan_name,category,status,expires_at,admin_disabled")
    .eq("user_email", email)
    .in("status", ["مفعل", "نشط", "active"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (/column .* does not exist/i.test(error.message || "")) {
      return { email, rows: [], activeRows: [], error: null, missingColumns: true };
    }
    return { email, rows: [], activeRows: [], error, missingColumns: false };
  }

  const activeRows = (rows || []).filter((row) => {
    if (row?.admin_disabled) return false;
    if (row?.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
    return true;
  });

  return {
    email,
    rows: rows || [],
    activeRows,
    error: null,
    missingColumns: false,
  };
}

async function persistProfileSubscriptionFromRequests(supabase, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("profile-subscription-reconcile-missing-email");
  }

  const { data, error } = await supabase.rpc("reconcile_profile_subscription_from_requests", {
    p_user_email: normalizedEmail,
  });

  if (error) {
    throw error;
  }

  const payload = data || {};
  if (!payload.success) {
    console.error("PROFILE_SUBSCRIPTION_RECONCILE_REJECTED", {
      email: normalizedEmail,
      reason: payload.reason || "profile-subscription-reconcile-failed",
    });
    throw new Error(payload.reason || "profile-subscription-reconcile-failed");
  }

  if (!payload.profile_matched) {
    console.error("PROFILE_SUBSCRIPTION_RECONCILE_MISMATCH", {
      email: normalizedEmail,
      profiles_updated: payload.profiles_updated,
      active_request_count: payload.active_request_count,
      expected_status: payload.expected_status,
      expected_plan: payload.expected_plan,
      actual_status: payload.actual_status,
      actual_plan: payload.actual_plan,
    });
    throw new Error("profile subscription reconcile did not persist expected state");
  }

  return payload;
}

export async function reconcileProfileAfterSubscriptionRemoval(
  supabase,
  { userEmail, removedRequestId, removedRow }
) {
  const { email, activeRows, error, missingColumns } = await fetchActiveSubscriptionRowsForUser(
    supabase,
    userEmail
  );

  if (!email) {
    return { profileReconciled: false, reason: "missing-email" };
  }

  if (missingColumns) {
    return { profileReconciled: false, reason: "missing-columns" };
  }

  if (error) {
    throw error;
  }

  const { normalizeAdminUserServiceType } = await import("./admin-user-service-classifier.js");
  const removedServiceType = normalizeAdminUserServiceType(removedRow || {});
  const removedId = String(removedRequestId || "").trim();

  const otherActiveSameService = activeRows.filter((row) => {
    if (String(row.id) === removedId) return false;
    return normalizeAdminUserServiceType(row) === removedServiceType;
  });

  await persistProfileSubscriptionFromRequests(supabase, email);

  const hasOtherActiveSameService = otherActiveSameService.length > 0;
  const removedServiceStillActive = activeRows.some(
    (row) => normalizeAdminUserServiceType(row) === removedServiceType
  );

  return {
    profileReconciled: true,
    hasOtherActiveSameService,
    otherActiveSameServiceCount: otherActiveSameService.length,
    otherActiveSameServiceIds: otherActiveSameService.map((row) => String(row.id)),
    removedServiceType,
    removedServiceStillActive,
    remainingActiveCount: activeRows.length,
    serviceRemovedFromProfile: !removedServiceStillActive,
  };
}

export async function reconcileProfileSubscriptionFromRequests(supabase, userEmail) {
  const { email, error, missingColumns } = await fetchActiveSubscriptionRowsForUser(
    supabase,
    userEmail
  );
  if (!email || missingColumns) return;
  if (error) throw error;
  await persistProfileSubscriptionFromRequests(supabase, email);
}
