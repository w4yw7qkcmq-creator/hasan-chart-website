/**
 * Client helper — call after a successful password/security credential change.
 * Triggers server-side global IAM revocation and clears session cookies.
 */
export async function finalizePasswordSecurityChange({
  previousAccessToken = null,
  trigger = "password_update",
} = {}) {
  const response = await fetch("/api/auth/password-security-changed", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger,
      previousAccessToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && payload?.success === true,
    requireReLogin: Boolean(payload?.requireReLogin),
    status: response.status,
    error: payload?.error || null,
  };
}

/**
 * Update password via Supabase client then revoke all prior sessions server-side.
 * Use from recovery / change-password UI only after user submits a new password.
 */
export async function updatePasswordAndRevokePriorSessions(supabase, {
  newPassword,
  previousAccessToken = null,
  trigger = "password_update",
} = {}) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: error.message || "password_update_failed" };
  }

  return finalizePasswordSecurityChange({ previousAccessToken, trigger });
}
