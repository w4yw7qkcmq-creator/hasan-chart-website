import { cookies } from "next/headers";
import { getSafeTheme, THEME_COOKIE_NAME } from "./theme-shared";

export async function readThemeFromRequestCookies() {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  return getSafeTheme(savedTheme);
}
