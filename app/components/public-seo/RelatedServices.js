import Link from "next/link";
import { getRelatedServices } from "../../../lib/internal-links";

export default function RelatedServices({ pageKey }) {
  const services = getRelatedServices(pageKey);

  if (!services.length) {
    return null;
  }

  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <div className="text-center">
        <h2 className="text-3xl font-black text-white">الخدمات ذات الصلة</h2>
        <p className="mt-3 text-slate-400">روابط مباشرة لخدمات قد تكمل احتياجك التداولي</p>
      </div>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <li key={service.href}>
            <Link
              href={service.href}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4 font-black text-cyan-100 no-underline transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-white"
            >
              <span>{service.label}</span>
              <span aria-hidden="true" className="text-cyan-300">
                ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
