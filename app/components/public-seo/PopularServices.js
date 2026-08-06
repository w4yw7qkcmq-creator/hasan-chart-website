import Link from "next/link";
import { getPopularServices } from "../../../lib/internal-links";
export default function PopularServices({ pageKey }) {
  const services = getPopularServices(pageKey);
  if (!services.length) {
    return null;
  }
  return (
    <section className="ui-public-seo-card public-seo-card">
      {" "}
      <div className="text-center">
        {" "}
        <h2 className="ui-public-seo-title ui-public-seo-title--section">
          الخدمات الأكثر زيارة
        </h2>{" "}
        <p className="ui-public-seo-subtitle mt-3">
          أكثر صفحات الخدمات التي يزورها متداولو HasaN CharT World
        </p>{" "}
      </div>{" "}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {" "}
        {services.map((service) => (
          <Link
            key={service.href}
            href={service.href}
            className="ui-public-seo-link-chip"
          >
            {" "}
            {service.label}{" "}
          </Link>
        ))}{" "}
      </div>{" "}
    </section>
  );
}
