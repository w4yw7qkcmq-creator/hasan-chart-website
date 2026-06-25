import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeTheme, THEME_COOKIE_NAME } from "../../../lib/theme-shared";

export async function POST(request) {
  try {
    const { theme } = await request.json();
    const safeTheme = getSafeTheme(theme);

    const response = NextResponse.json({ success: true, theme: safeTheme });

    response.cookies.set(THEME_COOKIE_NAME, safeTheme, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const theme = getSafeTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  return NextResponse.json({ theme });
}
