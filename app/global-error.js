"use client";

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

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    logClientBoundaryError(error, "global");
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="ui-global-error-body">
        <main className="flex min-h-screen items-center justify-center p-6 text-center">
          <div className="ui-global-error-panel">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border admin-panel-border admin-panel text-4xl">
              !
            </div>
            <h1 className="text-3xl font-black">تعذر تحميل المنصة</h1>
            <p className="mt-3 leading-7 ui-text-subtle">
              حدث خطأ عام في التطبيق. أعد تحميل الصفحة أو حاول لاحقاً.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex rounded-2xl border admin-panel-border admin-panel px-6 py-3 font-black ui-text-strong transition hover:admin-panel"
            >
              إعادة المحاولة
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
