"use client";

import Link from "next/link";
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

export default function Error({ error, reset }) {
  useEffect(() => {
    logClientBoundaryError(error, "segment");
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
      <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
        <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-amber-300/25 bg-amber-400/10 text-4xl">
            ⚠️
          </div>
          <h1 className="text-3xl font-black">حدث خطأ غير متوقع</h1>
          <p className="mt-3 leading-7 text-slate-400">
            واجهنا مشكلة أثناء تحميل هذه الصفحة. يمكنك إعادة المحاولة أو العودة للرئيسية.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-6 py-3 font-black text-white transition hover:bg-cyan-400/20"
            >
              إعادة المحاولة
            </button>
            <Link
              href="/"
              className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-black text-white transition hover:bg-white/10"
            >
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
