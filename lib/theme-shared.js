export const THEME_COOKIE_NAME = "hc_theme";

export function getSafeTheme(value) {
  return value === "light" ? "light" : "dark";
}

export function writeThemeCookie(theme) {
  if (typeof document === "undefined") return;

  const safeTheme = getSafeTheme(theme);
  document.cookie = `${THEME_COOKIE_NAME}=${safeTheme};path=/;max-age=31536000;SameSite=Lax`;
}
