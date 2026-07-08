import Link from "next/link";
import { getPopularServices } from "../../../lib/internal-links";

export default function PopularServices({ pageKey }) {
  const services = getPopularServices(pageKey);

  if (!services.length) {
    return null;
  }

  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <div className="text-center">
        <h2 className="text-3xl font-black text-white">الخدمات الأكثر زيارة</h2>
        <p className="mt-3 text-slate-400">أكثر صفحات الخدمات التي يزورها متداولو HasaN CharT World</p>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {services.map((service) => (
          <Link
            key={service.href}
            href={service.href}
            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 no-underline transition hover:border-cyan-300/40 hover:bg-cyan-400/20 hover:text-white"
          >
            {service.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
