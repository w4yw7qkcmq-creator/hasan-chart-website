/** Read-only profile enrichment for IAM admin display — no auth changes. */

async function loadProfilesByIds(supabase, userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id, email, username").in("id", ids);
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

export async function enrichAssignmentsForDisplay(supabase, assignments = []) {
  if (!assignments.length) return [];
  const profileIds = assignments.flatMap((a) => [a.user_id, a.granted_by, a.revoked_by].filter(Boolean));
  const profiles = await loadProfilesByIds(supabase, profileIds);

  return assignments.map((a) => {
    const userProfile = profiles[a.user_id];
    const granter = profiles[a.granted_by];
    return {
      ...a,
      user_email: userProfile?.email || null,
      user_display_name: userProfile?.username || null,
      granted_by_email: granter?.email || null,
    };
  });
}

export async function enrichSessionsForDisplay(supabase, sessions = []) {
  if (!sessions.length) return [];
  const profiles = await loadProfilesByIds(
    supabase,
    sessions.map((s) => s.user_id).filter(Boolean)
  );

  return sessions.map((s) => {
    const profile = profiles[s.user_id];
    return {
      ...s,
      user_email: profile?.email || null,
      user_display_name: profile?.username || null,
    };
  });
}
