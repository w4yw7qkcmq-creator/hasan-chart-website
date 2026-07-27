import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";

export const revalidate = REVALIDATE_STATIC_MARKETING;

export const metadata = buildPublicPageMetadata({
  path: "/order-book",
  title: "دفتر الأوامر والسيولة المباشر | HasaN CharT World",
  description:
    "متابعة لحظية لطلبات البيع والشراء، سيولة السوق، جدران الأوامر، الصفقات الكبيرة ومؤشر الخوف والطمع.",
  keywords: [
    "HasaN CharT World",
    "دفتر الأوامر",
    "Order Book",
    "سيولة السوق",
    "BTC USDT",
    "ETH USDT",
    "Binance",
    "OKX",
    "Bybit",
    "مؤشر الخوف والطمع",
  ],
});

export default function OrderBookLayout({ children }) {
  return children;
}
