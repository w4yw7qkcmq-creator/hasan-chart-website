export const THEME_COOKIE_NAME = "hc_theme";
export const THEME_COLOR_LIGHT = "#edf7ff";
export const THEME_COLOR_DARK = "#020617";

export function getSafeTheme(value) {
  return value === "light" ? "light" : "dark";
}

export function resolveThemeColor(theme) {
  return getSafeTheme(theme) === "light" ? THEME_COLOR_LIGHT : THEME_COLOR_DARK;
}

export function writeThemeCookie(theme) {
  if (typeof document === "undefined") return;

  const safeTheme = getSafeTheme(theme);
  document.cookie = `${THEME_COOKIE_NAME}=${safeTheme};path=/;max-age=31536000;SameSite=Lax`;
}
