import { Suspense } from "react";
import OrderBookPageContent from "../../components/order-book/OrderBookPageContent";

function OrderBookFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div
        className="h-96 animate-pulse rounded-2xl bg-[var(--ob-surface-muted,#1e293b)] motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="sr-only" role="status" aria-live="polite">
        جاري تحميل دفتر الأوامر...
      </p>
    </div>
  );
}

export default function OrderBookPage() {
  return (
    <Suspense fallback={<OrderBookFallback />}>
      <OrderBookPageContent />
    </Suspense>
  );
}
