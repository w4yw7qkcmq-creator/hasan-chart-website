import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = String(body?.access_token || "").trim();
    const refreshToken = String(body?.refresh_token || "").trim();
    const expiresIn = Number(body?.expires_in || 3600);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { success: false, error: "Session tokens are required" },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ success: true });
    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set("hc_access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn,
    });

    response.cookies.set("hc_refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to sync session cookies" },
      { status: 500 }
    );
  }
}
