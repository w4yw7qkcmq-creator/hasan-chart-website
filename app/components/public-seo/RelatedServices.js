import Link from "next/link";
import { getRelatedServices } from "../../../lib/internal-links";
export default function RelatedServices({ pageKey }) {
  const services = getRelatedServices(pageKey);
  if (!services.length) {
    return null;
  }
  return (
    <section className="ui-public-seo-card public-seo-card">
      {" "}
      <div className="text-center">
        {" "}
        <h2 className="ui-public-seo-title ui-public-seo-title--section">
          الخدمات ذات الصلة
        </h2>{" "}
        <p className="ui-public-seo-subtitle mt-3">
          روابط مباشرة لخدمات قد تكمل احتياجك التداولي
        </p>{" "}
      </div>{" "}
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {" "}
        {services.map((service) => (
          <li key={service.href}>
            {" "}
            <Link
              href={service.href}
              className="flex items-center justify-between rounded-2xl border admin-panel-border admin-panel px-5 py-4 font-black no-underline transition hover:admin-panel-border hover:admin-panel hover:ui-public-seo-title"
            >
              {" "}
              <span>{service.label}</span>{" "}
              <span aria-hidden="true" className="admin-text-muted">
                {" "}
                ←{" "}
              </span>{" "}
            </Link>{" "}
          </li>
        ))}{" "}
      </ul>{" "}
    </section>
  );
}
