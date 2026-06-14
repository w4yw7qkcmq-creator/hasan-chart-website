export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [
      "https://www.hasanchartworld.com/sitemap.xml",
      "https://www.hasanchartworld.com/news-sitemap.xml",
    ],
  };
}