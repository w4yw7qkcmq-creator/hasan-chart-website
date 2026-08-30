"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

function logClientBoundaryError(error, scope) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "ui.error_boundary",
      scope,
      digest: error?.digest || null,
      timestamp: new Date().toISOString(),
    })
  );
}

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    logClientBoundaryError(error, "global");
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-[#020617] text-white antialiased">
        <main className="flex min-h-screen items-center justify-center p-6 text-center">
          <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-[#07142f] p-8 shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-red-300/25 bg-red-400/10 text-4xl">
              !
            </div>
            <h1 className="text-3xl font-black">تعذر تحميل المنصة</h1>
            <p className="mt-3 leading-7 text-slate-400">
              حدث خطأ عام في التطبيق. أعد تحميل الصفحة أو حاول لاحقاً.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-6 py-3 font-black text-white transition hover:bg-cyan-400/20"
            >
              إعادة المحاولة
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
