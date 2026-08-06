import {
  PRIVATE_ROBOTS_PATHS,
  PUBLIC_ROBOTS_ALLOW_PATHS,
  SITE_URL,
} from "../lib/seo";
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_ROBOTS_ALLOW_PATHS,
      disallow: PRIVATE_ROBOTS_PATHS,
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
  };
}
