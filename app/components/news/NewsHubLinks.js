import Link from "next/link";
import { NEWS_HUB_LINKS } from "./newsListHelpers";

export function NewsHubLinks() {
  return (
    <nav className="news-page-hub-links" aria-label="روابط الأسواق والأخبار">
      {NEWS_HUB_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="news-page-hub-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
