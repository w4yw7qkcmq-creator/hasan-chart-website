import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set("hc_access_token", "", cookieOptions);
  response.cookies.set("hc_refresh_token", "", cookieOptions);

  return response;
}

export async function GET() {
  return POST();
}
