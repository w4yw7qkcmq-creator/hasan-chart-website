/** Session log lifecycle helpers (audit only — not used for authorization). */

export async function endAllActiveSessionLogsForUser(supabase, params) {
  const userId = String(params.userId || "").trim();
  if (!userId) return { ok: false };

  try {
    await supabase
      .from("iam_session_logs")
      .update({
        ended_at: new Date().toISOString(),
        end_reason: params.reason || "global_revoke",
        forced_by: params.forcedBy || null,
      })
      .eq("user_id", userId)
      .is("ended_at", null);
    return { ok: true };
  } catch (err) {
    console.warn("endAllActiveSessionLogsForUser skipped:", err?.message || err);
    return { ok: false };
  }
}
