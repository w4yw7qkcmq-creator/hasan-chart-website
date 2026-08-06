"use client";

import Link from "next/link";
import { useEffect } from "react";

function logClientBoundaryError(error, scope) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "ui.error_boundary",
      scope,
      digest: error?.digest || null,
      timestamp: new Date().toISOString(),
    }),
  );
}

export default function Error({ error, reset }) {
  useEffect(() => {
    logClientBoundaryError(error, "segment");
  }, [error]);

  return (
    <main className="ui-error-boundary-page">
      <div className="ui-error-boundary-page__backdrop" />
      <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
        <div className="max-w-md rounded-[32px] border admin-panel-border ui-glass-10 p-8 backdrop-blur-2xl">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border admin-panel-border admin-panel text-4xl">
            ⚠️
          </div>
          <h1 className="text-3xl font-black">حدث خطأ غير متوقع</h1>
          <p className="mt-3 leading-7 ui-text-subtle">
            واجهنا مشكلة أثناء تحميل هذه الصفحة. يمكنك إعادة المحاولة أو العودة للرئيسية.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex rounded-2xl border admin-panel-border admin-panel px-6 py-3 font-black ui-text-strong transition hover:admin-panel"
            >
              إعادة المحاولة
            </button>
            <Link
              href="/"
              className="inline-flex rounded-2xl border admin-panel-border ui-glass-10 px-6 py-3 font-black ui-text-strong transition hover:ui-glass-10"
            >
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
