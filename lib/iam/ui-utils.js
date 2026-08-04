/** Presentation helpers for IAM admin UI — no authorization logic. */

export function formatDateTime(value, locale = "ar-SA") {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

export function formatRelativeTime(value, locale = "ar") {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const diffMs = Date.now() - d.getTime();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const minutes = Math.round(diffMs / 60000);
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 48) return rtf.format(-hours, "hour");
    const days = Math.round(hours / 24);
    return rtf.format(-days, "day");
  } catch {
    return formatDateTime(value);
  }
}

export function maskIp(ip) {
  if (!ip) return null;
  const parts = String(ip).split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return `${String(ip).slice(0, 6)}***`;
}

export function userDisplayName(record) {
  if (!record) return "—";
  const name = record.user_display_name || record.display_name || record.username;
  const email = record.user_email || record.email || record.actor_email;
  if (name && email) return `${name} (${email})`;
  if (email) return email;
  if (name) return name;
  return null;
}

export function userInitials(record) {
  const label = userDisplayName(record) || "?";
  const base = label.includes("@") ? label.split("@")[0] : label;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function buildAdminUsersFromAssignments(assignments = []) {
  const map = new Map();
  for (const row of assignments) {
    const key = row.user_id;
    if (!key) continue;
    const existing = map.get(key) || {
      user_id: key,
      user_email: row.user_email,
      user_display_name: row.user_display_name,
      roles: [],
      assignments: [],
      last_granted_at: null,
      status: "active",
    };
    existing.user_email = existing.user_email || row.user_email;
    existing.user_display_name = existing.user_display_name || row.user_display_name;
    existing.assignments.push(row);
    if (!existing.roles.includes(row.role_id)) existing.roles.push(row.role_id);
    if (!existing.last_granted_at || row.granted_at > existing.last_granted_at) {
      existing.last_granted_at = row.granted_at;
    }
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) =>
    String(b.last_granted_at || "").localeCompare(String(a.last_granted_at || ""))
  );
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function filterBySearch(rows, query, keys) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    keys.some((k) => String(row[k] || "").toLowerCase().includes(q))
  );
}
