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

export function filterByDateRange(rows, dateKey, from, to) {
  let result = rows || [];
  if (from) {
    const start = new Date(from);
    result = result.filter((r) => !r[dateKey] || new Date(r[dateKey]) >= start);
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    result = result.filter((r) => !r[dateKey] || new Date(r[dateKey]) <= end);
  }
  return result;
}

export function paginateRows(rows, page, pageSize = 15) {
  const total = (rows || []).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: (rows || []).slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
  };
}

export function countUsersByRole(assignments = []) {
  const map = new Map();
  for (const row of assignments) {
    if (row.revoked_at || !row.role_id) continue;
    map.set(row.role_id, (map.get(row.role_id) || 0) + 1);
  }
  return map;
}

export function resolveUserPermissions(user, matrix = {}) {
  const ids = new Set();
  for (const roleId of user?.roles || []) {
    for (const p of matrix[roleId]?.permissions || []) {
      ids.add(p.permissionId || p.id);
    }
  }
  return [...ids];
}

export function parseUserAgent(ua) {
  if (!ua) return { browser: null, platform: null };
  const s = String(ua);
  let browser = "غير معروف";
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/Chrome\//i.test(s)) browser = "Chrome";
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = "Safari";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  let platform = "غير معروف";
  if (/Windows/i.test(s)) platform = "Windows";
  else if (/Mac OS X|Macintosh/i.test(s)) platform = "macOS";
  else if (/Android/i.test(s)) platform = "Android";
  else if (/iPhone|iPad/i.test(s)) platform = "iOS";
  else if (/Linux/i.test(s)) platform = "Linux";
  return { browser, platform };
}

export function sessionDuration(start, end) {
  if (!start) return "—";
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 60) return `${mins} د`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hours} س ${rem} د` : `${hours} س`;
}

export function exportToJson(rows, filename) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(rows, filename, columns) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = (rows || [])
    .map((row) =>
      columns.map((c) => escape(c.format ? c.format(row[c.key], row) : row[c.key])).join(",")
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
