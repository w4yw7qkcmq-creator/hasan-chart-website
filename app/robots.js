import { PRIVATE_ROBOTS_PATHS, SITE_URL } from "../lib/seo";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_ROBOTS_PATHS,
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
  };
}
