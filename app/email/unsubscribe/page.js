import { Suspense } from "react";
import UnsubscribeClient from "./UnsubscribeClient";

function UnsubscribeFallback() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center p-6 text-center">
      <h1 className="text-2xl font-black">إلغاء الاشتراك</h1>
      <p className="mt-3 text-slate-600">لن تصلك رسائل تسويقية مستقبلية من HasaN CharT World.</p>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<UnsubscribeFallback />}>
      <UnsubscribeClient />
    </Suspense>
  );
}
