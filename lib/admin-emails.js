export const FALLBACK_ADMIN_EMAILS = [
  "alerts@hasanchartworld.com",
  "admin@hasanchartworld.com",
  "hasanchartworld@gmail.com",
  "ahmaagahmaadd@gmail.com",
];

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isFallbackAdminEmail(email) {
  return FALLBACK_ADMIN_EMAILS.includes(normalizeEmail(email));
}

export function resolveUserRole(email, profileRole) {
  if (isFallbackAdminEmail(email)) return "admin";
  if (String(profileRole || "").trim() === "admin") return "admin";
  return "user";
}

export function isAdminUser(user) {
  if (!user?.email) return false;
  return resolveUserRole(user.email, user.role) === "admin";
}
