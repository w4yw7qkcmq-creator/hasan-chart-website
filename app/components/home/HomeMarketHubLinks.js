import Link from "next/link";

export const HOME_MARKET_HUB_LINKS = [
  { href: "/markets", label: "الأسواق المالية" },
  { href: "/gold", label: "سوق الذهب" },
  { href: "/xauusd", label: "XAU/USD" },
  { href: "/forex", label: "الفوركس" },
  { href: "/crypto", label: "العملات الرقمية" },
  { href: "/stocks", label: "الأسهم والمؤشرات" },
];

export default function HomeMarketHubLinks() {
  return (
    <section className="w-full" aria-labelledby="home-market-hubs-title">
      <div className="glassPanel rounded-[28px] border border-white/10 p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-2 text-center lg:text-right">
          <h2 id="home-market-hubs-title" className="sectionTitle">
            استكشف الأسواق
          </h2>
          <p className="text-sm font-bold leading-7 text-slate-200">
            انتقل مباشرة إلى مراكز الأسواق الدائمة في HasaN CharT World.
          </p>
        </div>

        <nav className="flex flex-wrap justify-center gap-3 lg:justify-start" aria-label="مراكز الأسواق">
          {HOME_MARKET_HUB_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:border-blue-300/60 hover:bg-white/15"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
