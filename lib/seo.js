export const SITE_URL = "https://www.hasanchartworld.com";

export const SITE_ENTITY_IDS = {
  organization: `${SITE_URL}/#organization`,
  website: `${SITE_URL}/#website`,
  logo: `${SITE_URL}/#logo`,
};

export const SITE_ORGANIZATION_NAME = "HasaN CharT World";

export const SITE_ORGANIZATION_ALTERNATE_NAMES = [
  "HasaN CharT",
  "Hasan Chart World",
  "حسن شارت",
];

export const SITE_ENTITY_DESCRIPTION =
  "منصة احترافية لمتابعة أسواق المال، تحليلات العملات الرقمية والفوركس، توصيات التداول، الأخبار الاقتصادية والتنبيهات السعرية.";

export const SITE_OFFICIAL_PROFILES = [
  "https://t.me/HasaNCharTSupport",
  "https://t.me/HsaNCharT",
  "https://t.me/CEOHasaNCharT",
  "https://x.com/HasanChart",
];

export const SITE_SUPPORT_EMAIL = "support@hasanchartworld.com";

export const SITE_LOGO_URL = `${SITE_URL}/favicon.png`;

export const SITE_LOGO_IMAGE = {
  "@type": "ImageObject",
  "@id": SITE_ENTITY_IDS.logo,
  url: SITE_LOGO_URL,
  contentUrl: SITE_LOGO_URL,
  width: 512,
  height: 512,
  caption: "HasaN CharT World Logo",
};

export function buildOrganizationReference() {
  return { "@id": SITE_ENTITY_IDS.organization };
}

export function buildWebSiteReference() {
  return { "@id": SITE_ENTITY_IDS.website };
}

export function buildPublisherReference() {
  return buildOrganizationReference();
}

export function toIsoDateTime(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function buildNewsArticlePublisherNode() {
  return {
    "@type": "Organization",
    "@id": SITE_ENTITY_IDS.organization,
    name: SITE_ORGANIZATION_NAME,
    url: SITE_URL,
    logo: SITE_LOGO_IMAGE,
  };
}

export function buildOrganizationSchema() {
  return {
    "@type": "Organization",
    "@id": SITE_ENTITY_IDS.organization,
    name: SITE_ORGANIZATION_NAME,
    alternateName: SITE_ORGANIZATION_ALTERNATE_NAMES,
    url: SITE_URL,
    logo: SITE_LOGO_IMAGE,
    image: SITE_LOGO_URL,
    description: sanitizeJsonLdText(SITE_ENTITY_DESCRIPTION, 300),
    email: SITE_SUPPORT_EMAIL,
    sameAs: SITE_OFFICIAL_PROFILES,
    areaServed: "Worldwide",
    availableLanguage: ["ar", "en"],
    brand: {
      "@type": "Brand",
      name: SITE_ORGANIZATION_NAME,
      logo: { "@id": SITE_ENTITY_IDS.logo },
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SITE_SUPPORT_EMAIL,
        url: "https://t.me/HasaNCharTSupport",
        availableLanguage: ["ar", "en"],
        areaServed: "Worldwide",
      },
    ],
  };
}

export function buildWebSiteSchema() {
  return {
    "@type": "WebSite",
    "@id": SITE_ENTITY_IDS.website,
    name: SITE_ORGANIZATION_NAME,
    alternateName: SITE_ORGANIZATION_ALTERNATE_NAMES,
    url: SITE_URL,
    description: sanitizeJsonLdText(SITE_ENTITY_DESCRIPTION, 300),
    inLanguage: "ar",
    publisher: buildPublisherReference(),
  };
}

export function buildSiteEntityGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [buildOrganizationSchema(), buildWebSiteSchema()],
  };
}

export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/about",
  "/brand",
  "/company",
  "/markets",
  "/assets",
  "/crypto",
  "/btc",
  "/eth",
  "/sol",
  "/xrp",
  "/bnb",
  "/ada",
  "/doge",
  "/avax",
  "/link",
  "/matic",
  "/dot",
  "/ltc",
  "/trx",
  "/uni",
  "/aave",
  "/shib",
  "/pepe",
  "/atom",
  "/fil",
  "/bch",
  "/near",
  "/op",
  "/arb",
  "/inj",
  "/forex",
  "/dxy",
  "/eurusd",
  "/xauusd",
  "/gbpusd",
  "/usdjpy",
  "/usdchf",
  "/audusd",
  "/nzdusd",
  "/usdcad",
  "/eurjpy",
  "/gbpjpy",
  "/eurgbp",
  "/gold",
  "/xau",
  "/xag",
  "/stocks",
  "/nasdaq",
  "/sp500",
  "/dowjones",
  "/dax",
  "/nikkei",
  "/ftse",
  "/cac40",
  "/oil",
  "/usoil",
  "/commodities",
  "/economic-news",
  "/technical-analysis",
  "/price-alerts",
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
  "/partner-center",
  "/account-management",
  "/analysis/request",
  "/vip-spot",
  "/vip-futures",
  "/crypto-analysis",
  "/forex-signals",
  "/account-management-service",
  "/trading-academy",
  "/vip-spot-signals",
  "/vip-futures-signals",
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
  "/affiliate",
  "/api/",
  "/403",
  "/r/",
];

export const PUBLIC_ROBOTS_ALLOW_PATHS = ["/", "/_next/static/", "/favicon.png"];

export function normalizeIndexingPath(path = "/") {
  const normalized = String(path || "/").trim();

  if (!normalized || normalized === "/") {
    return "/";
  }

  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export function isPrivateIndexingPath(path = "/") {
  const normalized = normalizeIndexingPath(path);

  return PRIVATE_ROBOTS_PATHS.some((privatePath) => {
    if (privatePath.endsWith("/")) {
      return normalized === privatePath.slice(0, -1) || normalized.startsWith(privatePath);
    }

    return normalized === privatePath || normalized.startsWith(`${privatePath}/`);
  });
}

export function getPublicSitemapPaths(paths = PUBLIC_SITEMAP_PATHS) {
  return paths.filter((path) => !isPrivateIndexingPath(path));
}

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
  const publicPaths = getPublicSitemapPaths(paths);

  return publicPaths.map((path) => ({
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

export function buildBreadcrumbJsonLd(items = [], path = "") {
  const breadcrumbPath = path || items[items.length - 1]?.href || "/";

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": buildSchemaFragmentId(breadcrumbPath, "breadcrumb"),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: sanitizeJsonLdText(item.label, index === items.length - 1 ? 150 : 120),
      item: buildAbsoluteUrl(item.href),
    })),
  };
}

export function buildSchemaPageId(path = "/") {
  return buildAbsoluteUrl(path);
}

export function buildSchemaFragmentId(path = "/", fragment = "entity") {
  return `${buildAbsoluteUrl(path)}#${fragment}`;
}

export function buildSchemaGraph(nodes = []) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
}

export function buildFaqPageNode(faq = [], path = "/") {
  if (!Array.isArray(faq) || faq.length === 0) {
    return null;
  }

  return {
    "@type": "FAQPage",
    "@id": buildSchemaFragmentId(path, "faq"),
    isPartOf: { "@id": buildSchemaPageId(path) },
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: sanitizeJsonLdText(item.q),
      acceptedAnswer: {
        "@type": "Answer",
        text: sanitizeJsonLdText(item.a),
      },
    })),
  };
}

export function buildItemListNode({ path, name, items = [], fragment = "itemlist" }) {
  return {
    "@type": "ItemList",
    "@id": buildSchemaFragmentId(path, fragment),
    name: sanitizeJsonLdText(name, 120),
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: sanitizeJsonLdText(item.name, 80),
      url: buildAbsoluteUrl(item.url),
    })),
  };
}

function buildPageNodeBase({
  path,
  title,
  description,
  pageType = "WebPage",
  mainEntityId,
  about,
}) {
  const url = buildSchemaPageId(path);
  const node = {
    "@type": pageType,
    "@id": url,
    url,
    name: sanitizeJsonLdText(title, 120),
    description: sanitizeJsonLdText(description, 300),
    inLanguage: "ar",
    isPartOf: buildWebSiteReference(),
    publisher: buildPublisherReference(),
    about: about || buildOrganizationReference(),
  };

  if (mainEntityId) {
    node.mainEntity = { "@id": mainEntityId };
  }

  return node;
}

export function buildWebPageNode(options) {
  return buildPageNodeBase({
    ...options,
    pageType: options.pageType || "WebPage",
  });
}

export function buildCollectionPageNode({
  path,
  title,
  description,
  mainEntityId,
  about,
  fragment = "collection",
}) {
  const collectionId = buildSchemaFragmentId(path, fragment);
  const url = buildSchemaPageId(path);

  return {
    "@type": "CollectionPage",
    "@id": collectionId,
    url,
    name: sanitizeJsonLdText(title, 120),
    description: sanitizeJsonLdText(description, 300),
    inLanguage: "ar",
    isPartOf: buildWebSiteReference(),
    publisher: buildPublisherReference(),
    about: about || buildOrganizationReference(),
    ...(mainEntityId ? { mainEntity: { "@id": mainEntityId } } : {}),
  };
}

export function buildCollectionHubPageJsonLd({
  path = "/",
  title = "",
  description = "",
  items = [],
  faq = [],
  itemListName = "",
  pageType = "WebPage",
  about,
} = {}) {
  const collectionId = buildSchemaFragmentId(path, "collection");
  const itemListId = buildSchemaFragmentId(path, "itemlist");
  const hasItems = Array.isArray(items) && items.length > 0;

  return buildSchemaGraph([
    buildWebPageNode({
      path,
      title,
      description,
      pageType,
      mainEntityId: collectionId,
      about,
    }),
    buildCollectionPageNode({
      path,
      title,
      description,
      mainEntityId: hasItems ? itemListId : undefined,
      about,
    }),
    hasItems
      ? buildItemListNode({
          path,
          name: itemListName || sanitizeJsonLdText(title, 120),
          items,
        })
      : null,
    buildFaqPageNode(faq, path),
  ]);
}

export function buildNewsCollectionPageJsonLd({
  path = "/news",
  title = "",
  description = "",
} = {}) {
  return buildCollectionHubPageJsonLd({
    path,
    title,
    description,
    items: [],
    faq: [],
  });
}

export function buildNewsArticleJsonLd({
  path,
  title,
  description,
  content = "",
  image,
  datePublished,
  dateModified,
  articleSection = "",
  topicLabel = "",
  mentions = [],
}) {
  const articleUrl = buildSchemaPageId(path);
  const safeTitle = sanitizeJsonLdText(title, 110);
  const safeDescription = sanitizeJsonLdText(description, 180);
  const safeSection = sanitizeJsonLdText(articleSection, 80);
  const imageUrl = (() => {
    if (!image) return SITE_LOGO_URL;
    const value = String(image);
    return /^https?:\/\//i.test(value) ? value : buildAbsoluteUrl(value);
  })();
  const publishedIso = toIsoDateTime(datePublished) || toIsoDateTime(new Date());
  const modifiedIso = toIsoDateTime(dateModified) || publishedIso;
  const publisher = buildNewsArticlePublisherNode();

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": articleUrl,
    url: articleUrl,
    headline: safeTitle,
    description: safeDescription,
    image: [imageUrl],
    thumbnailUrl: imageUrl,
    datePublished: publishedIso,
    dateModified: modifiedIso,
    inLanguage: "ar",
    isAccessibleForFree: true,
    keywords: [
      safeTitle,
      sanitizeJsonLdText(topicLabel, 60),
      "أخبار اقتصادية",
      "فوركس",
      "عملات رقمية",
      "أسواق عالمية",
    ],
    articleSection: safeSection,
    wordCount: String(content || "")
      .split(/\s+/)
      .filter(Boolean).length,
    genre: safeSection,
    about: {
      "@type": "Thing",
      name: safeSection,
    },
    mentions: mentions.slice(0, 6).map((asset) => ({
      "@type": "Thing",
      name: sanitizeJsonLdText(asset.symbol || asset.name, 20),
      url: buildAbsoluteUrl(asset.path || asset.url),
    })),
    isPartOf: buildWebSiteReference(),
    author: {
      "@type": "Organization",
      name: SITE_ORGANIZATION_NAME,
      url: SITE_URL,
    },
    publisher,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };
}

const DEFAULT_OG_IMAGE = {
  url: "/favicon.png",
  width: 512,
  height: 512,
  alt: SITE_ORGANIZATION_NAME,
};

export const SITE_METADATA_BASE = new URL(SITE_URL);

function resolveMetadataTitle(title) {
  if (!title) {
    return "";
  }

  if (typeof title === "object") {
    return title.default || title.absolute || Object.values(title)[0] || "";
  }

  return String(title);
}

export function buildCanonical(path = "/") {
  const normalizedPath = String(path || "/").startsWith("/")
    ? String(path || "/")
    : `/${path}`;

  return normalizedPath === "/" ? "/" : normalizedPath;
}

export function buildRobots({ index = true, follow = true, nocache = false } = {}) {
  return {
    index,
    follow,
    ...(nocache ? { nocache: true } : {}),
    googleBot: {
      index,
      follow,
    },
  };
}

export function buildRobotsMetadata({ index = true, follow = true, nocache = false } = {}) {
  return { robots: buildRobots({ index, follow, nocache }) };
}

export function buildOpenGraph({
  title,
  description,
  url,
  type = "website",
  images,
  locale = "ar_AR",
  siteName = SITE_ORGANIZATION_NAME,
  ...rest
}) {
  return {
    type,
    locale,
    url,
    siteName,
    title,
    description,
    images: images || [DEFAULT_OG_IMAGE],
    ...rest,
  };
}

export function buildTwitterCard({
  title,
  description,
  images,
  card = "summary_large_image",
  ...rest
}) {
  const imageList = images || [DEFAULT_OG_IMAGE];

  return {
    card,
    title,
    description,
    images: imageList.map((image) => (typeof image === "string" ? image : image.url)),
    ...rest,
  };
}

export function buildPublicMetadata({
  path = "/",
  title,
  description = "",
  keywords = "",
  index = true,
  follow = true,
  nocache = false,
  type = "website",
  images,
  openGraph = {},
  twitter = {},
} = {}) {
  const canonicalPath = buildCanonical(path);
  const absoluteUrl = buildAbsoluteUrl(path);
  const titleText = resolveMetadataTitle(title);
  const keywordText = Array.isArray(keywords) ? keywords.join(", ") : String(keywords || "");
  const resolvedImages = images || [DEFAULT_OG_IMAGE];

  const metadata = {
    metadataBase: SITE_METADATA_BASE,
    robots: buildRobots({ index, follow, nocache }),
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: buildOpenGraph({
      title: openGraph.title || titleText,
      description: openGraph.description || description,
      url: openGraph.url || absoluteUrl,
      type: openGraph.type || type,
      images: openGraph.images || resolvedImages,
      ...openGraph,
    }),
    twitter: buildTwitterCard({
      title: twitter.title || titleText,
      description: twitter.description || description,
      images: twitter.images || resolvedImages,
      ...twitter,
    }),
  };

  if (title) {
    metadata.title = title;
  }

  if (description) {
    metadata.description = description;
  }

  if (keywordText) {
    metadata.keywords = keywordText;
  }

  return metadata;
}

export function buildPrivateMetadata({ title, description } = {}) {
  const metadata = {
    metadataBase: SITE_METADATA_BASE,
    robots: buildRobots({ index: false, follow: false, nocache: true }),
  };

  if (title) {
    metadata.title = title;
  }

  if (description) {
    metadata.description = description;
  }

  return metadata;
}

export function buildArticleMetadata({
  path,
  title,
  description,
  keywords = "",
  image,
  publishedTime,
  modifiedTime,
  section = "Economic News",
  tags = [],
}) {
  const images = image
    ? [{ url: image, width: 1200, height: 630, alt: title }]
    : undefined;
  const publishedIso = toIsoDateTime(publishedTime);
  const modifiedIso = toIsoDateTime(modifiedTime) || publishedIso;

  return buildPublicMetadata({
    path,
    title: `${title} - HasaN CharT World`,
    description,
    keywords,
    type: "article",
    images,
    openGraph: {
      type: "article",
      section,
      tags: tags.length > 0 ? tags : [title, "اقتصاد", "أسواق مالية", "فوركس", "كريبتو"],
      ...(publishedIso ? { publishedTime: publishedIso } : {}),
      ...(modifiedIso ? { modifiedTime: modifiedIso } : {}),
    },
  });
}

export const PRIVATE_PAGE_METADATA = buildRobotsMetadata({
  index: false,
  follow: false,
  nocache: true,
});

export const PUBLIC_PAGE_METADATA = buildRobotsMetadata({
  index: true,
  follow: true,
});

/** @deprecated Use buildPublicMetadata — kept for backward compatibility */
export function buildPublicPageMetadata(options) {
  return buildPublicMetadata(options);
}

export function buildAboutPageJsonLd({
  path = "/about",
  title = "من نحن | HasaN CharT World",
  description = "",
}) {
  return buildSchemaGraph([
    buildWebPageNode({
      path,
      title,
      description,
      pageType: "AboutPage",
      mainEntityId: SITE_ENTITY_IDS.organization,
      about: buildOrganizationReference(),
    }),
  ]);
}

export function buildBrandPageJsonLd({
  path = "/brand",
  title = "HasaN CharT World | العلامة التجارية الرسمية",
  description = "",
}) {
  const brandId = buildSchemaFragmentId(path, "brand");
  const safeTitle = sanitizeJsonLdText(title, 120);
  const safeDescription = sanitizeJsonLdText(description, 300);

  return buildSchemaGraph([
    {
      "@type": "Brand",
      "@id": brandId,
      name: SITE_ORGANIZATION_NAME,
      alternateName: SITE_ORGANIZATION_ALTERNATE_NAMES,
      url: buildSchemaPageId(path),
      logo: { "@id": SITE_ENTITY_IDS.logo },
      image: SITE_LOGO_URL,
      description: safeDescription,
      parentOrganization: buildOrganizationReference(),
    },
    buildWebPageNode({
      path,
      title: safeTitle,
      description: safeDescription,
      mainEntityId: brandId,
      about: { "@id": brandId },
    }),
  ]);
}

export function buildCompanyPageJsonLd({
  path = "/company",
  title = "HasaN CharT World | الشركة",
  description = "",
  faq = [],
}) {
  const corporationId = buildSchemaFragmentId(path, "corporation");
  const safeTitle = sanitizeJsonLdText(title, 120);
  const safeDescription = sanitizeJsonLdText(description, 300);

  return buildSchemaGraph([
    {
      "@type": "Corporation",
      "@id": corporationId,
      name: SITE_ORGANIZATION_NAME,
      alternateName: SITE_ORGANIZATION_ALTERNATE_NAMES,
      url: buildSchemaPageId(path),
      logo: { "@id": SITE_ENTITY_IDS.logo },
      image: SITE_LOGO_URL,
      description: safeDescription,
      sameAs: SITE_OFFICIAL_PROFILES,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SITE_SUPPORT_EMAIL,
          url: "https://t.me/HasaNCharTSupport",
          availableLanguage: ["ar", "en"],
          areaServed: "Worldwide",
        },
      ],
      parentOrganization: buildOrganizationReference(),
    },
    buildWebPageNode({
      path,
      title: safeTitle,
      description: safeDescription,
      mainEntityId: corporationId,
      about: buildOrganizationReference(),
    }),
    buildFaqPageNode(faq, path),
  ]);
}

function buildHubPageJsonLd({ path, title, description, items, faq, itemListName }) {
  return buildCollectionHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName,
  });
}

export function buildMarketsPageJsonLd({
  path = "/markets",
  title = "HasaN CharT World | الأسواق المالية",
  description = "",
  items = [],
  faq = [],
  itemListName = "الأسواق المالية في HasaN CharT World",
}) {
  return buildHubPageJsonLd({ path, title, description, items, faq, itemListName });
}

export function buildCryptoPageJsonLd({
  path = "/crypto",
  title = "HasaN CharT World | العملات الرقمية",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "العملات الرقمية في HasaN CharT World",
  });
}

export function buildForexPageJsonLd({
  path = "/forex",
  title = "HasaN CharT World | الفوركس",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "الفوركس في HasaN CharT World",
  });
}

export function buildGoldPageJsonLd({
  path = "/gold",
  title = "HasaN CharT World | الذهب",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "الذهب في HasaN CharT World",
  });
}

export function buildStocksPageJsonLd({
  path = "/stocks",
  title = "HasaN CharT World | الأسهم الأمريكية",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "الأسهم الأمريكية في HasaN CharT World",
  });
}

export function buildOilPageJsonLd({
  path = "/oil",
  title = "HasaN CharT World | النفط والطاقة",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "النفط والطاقة في HasaN CharT World",
  });
}

export function buildCommoditiesPageJsonLd({
  path = "/commodities",
  title = "HasaN CharT World | السلع العالمية",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "السلع العالمية في HasaN CharT World",
  });
}

export function buildEconomicNewsPageJsonLd({
  path = "/economic-news",
  title = "HasaN CharT World | الأخبار الاقتصادية",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "الأخبار الاقتصادية في HasaN CharT World",
  });
}

export function buildNewsListPageJsonLd({
  path = "/news",
  title = "HasaN CharT World | الأخبار الاقتصادية العاجلة",
  description = "",
}) {
  return buildNewsCollectionPageJsonLd({ path, title, description });
}

export function buildDailyAnalysisListPageJsonLd({
  path = "/daily-analysis",
  title = "HasaN CharT World | التحليلات اليومية",
  description = "",
}) {
  return buildNewsCollectionPageJsonLd({ path, title, description });
}

export function buildTechnicalAnalysisPageJsonLd({
  path = "/technical-analysis",
  title = "HasaN CharT World | التحليل الفني",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "التحليل الفني في HasaN CharT World",
  });
}

export function buildPriceAlertsPageJsonLd({
  path = "/price-alerts",
  title = "HasaN CharT World | التنبيهات السعرية",
  description = "",
  items = [],
  faq = [],
}) {
  return buildHubPageJsonLd({
    path,
    title,
    description,
    items,
    faq,
    itemListName: "التنبيهات السعرية في HasaN CharT World",
  });
}


export function buildAssetPageJsonLd({
  path = "/btc",
  title = "HasaN CharT World | Asset Hub",
  description = "",
  items = [],
  faq = [],
  asset = {},
}) {
  const assetId = buildSchemaFragmentId(path, asset.fragmentId || "asset");
  const collectionId = buildSchemaFragmentId(path, "collection");
  const itemListId = buildSchemaFragmentId(path, "itemlist");
  const safeTitle = sanitizeJsonLdText(title, 120);
  const safeDescription = sanitizeJsonLdText(description, 300);

  return buildSchemaGraph([
    buildWebPageNode({
      path,
      title: safeTitle,
      description: safeDescription,
      mainEntityId: collectionId,
      about: { "@id": assetId },
    }),
    buildCollectionPageNode({
      path,
      title: safeTitle,
      description: safeDescription,
      mainEntityId: itemListId,
      about: { "@id": assetId },
    }),
    {
      "@type": "FinancialProduct",
      "@id": assetId,
      name: sanitizeJsonLdText(asset.productName || "Asset", 80),
      alternateName: Array.isArray(asset.alternateNames)
        ? asset.alternateNames.map((name) => sanitizeJsonLdText(name, 40))
        : [],
      category: sanitizeJsonLdText(asset.productCategory || "Financial Asset", 60),
      url: buildSchemaPageId(path),
      provider: buildOrganizationReference(),
    },
    buildItemListNode({
      path,
      name: asset.itemListName || "Asset Hub",
      items,
    }),
    buildFaqPageNode(faq, path),
  ]);
}

/** @deprecated Use buildAssetPageJsonLd */
export function buildBtcAssetPageJsonLd(options) {
  return buildAssetPageJsonLd(options);
}

export function buildPublicServiceJsonLd({ path, title, description, faq = [] }) {
  const serviceId = buildSchemaFragmentId(path, "service");
  const safeTitle = sanitizeJsonLdText(title);
  const safeDescription = sanitizeJsonLdText(description);

  return buildSchemaGraph([
    buildWebPageNode({
      path,
      title: safeTitle,
      description: safeDescription,
      mainEntityId: serviceId,
    }),
    {
      "@type": "Service",
      "@id": serviceId,
      name: safeTitle,
      description: safeDescription,
      provider: buildOrganizationReference(),
      areaServed: "Worldwide",
      url: buildSchemaPageId(path),
    },
    buildFaqPageNode(faq, path),
  ]);
}
