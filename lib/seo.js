export const SITE_URL = "https://www.hasanchartworld.com";

export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/news",
  "/news/category/geopolitics",
  "/news/category/economy",
  "/news/category/stocks",
  "/news/category/crypto",
  "/news/category/commodities",
  "/news/tag/bitcoin",
  "/news/tag/crypto",
  "/news/tag/gold",
  "/news/tag/oil",
  "/news/tag/fed",
  "/news/tag/inflation",
  "/news/tag/forex",
  "/news/tag/stocks",
  "/daily-analysis",
  "/subscriptions",
  "/affiliate",
  "/partner-center",
  "/account-management",
  "/analysis/request",
  "/vip-spot",
  "/vip-futures",
];

export const PRIVATE_ROBOTS_PATHS = [
  "/admin",
  "/login",
  "/register",
  "/dashboard",
  "/my-dashboard",
  "/my-analysis",
  "/notifications",
  "/notification-settings",
  "/notification-sound-settings",
  "/alerts",
  "/r/",
];

export const PRIVATE_PAGE_METADATA = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export const PUBLIC_PAGE_METADATA = {
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export function buildAbsoluteUrl(path = "/") {
  const normalizedPath = String(path || "/").startsWith("/")
    ? String(path || "/")
    : `/${path}`;

  if (normalizedPath === "/") {
    return SITE_URL;
  }

  return `${SITE_URL}${normalizedPath}`;
}

export function buildSitemapEntries(paths = PUBLIC_SITEMAP_PATHS) {
  const lastModified = new Date();

  return paths.map((path) => ({
    url: buildAbsoluteUrl(path),
    lastModified,
  }));
}

export function sanitizeJsonLdText(value, maxLength = 0) {
  let text = String(value || "")
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "")
    .replace(/\\x[0-9a-fA-F]{0,2}/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }

  return text;
}

export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/favicon.png`,
  width: 512,
  height: 512,
  alt: "HasaN CharT World",
};

export function buildPublicPageMetadata({
  path,
  title,
  description,
  keywords = "",
}) {
  const url = buildAbsoluteUrl(path);

  return {
    ...PUBLIC_PAGE_METADATA,
    title,
    description,
    keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      locale: "ar_AR",
      url,
      siteName: "HasaN CharT World",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

export function buildPublicServiceJsonLd({ path, title, description, faq = [] }) {
  const url = buildAbsoluteUrl(path);
  const safeTitle = sanitizeJsonLdText(title);
  const safeDescription = sanitizeJsonLdText(description);

  const graph = [
    {
      "@type": "WebPage",
      name: safeTitle,
      description: safeDescription,
      url,
      isPartOf: {
        "@type": "WebSite",
        name: "HasaN CharT World",
        url: SITE_URL,
      },
      inLanguage: "ar",
    },
    {
      "@type": "Service",
      name: safeTitle,
      description: safeDescription,
      provider: {
        "@type": "Organization",
        name: "HasaN CharT World",
        url: SITE_URL,
      },
      areaServed: "Worldwide",
      url,
    },
  ];

  if (faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: sanitizeJsonLdText(item.q),
        acceptedAnswer: {
          "@type": "Answer",
          text: sanitizeJsonLdText(item.a),
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
