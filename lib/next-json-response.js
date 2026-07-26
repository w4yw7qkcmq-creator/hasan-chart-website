import { NextResponse } from "next/server";

export function nextJsonOk(payload, status = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
}

export function nextJsonError(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: typeof error === "string" ? error : error?.message || "Server Error",
    },
    { status }
  );
}
