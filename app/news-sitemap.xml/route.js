import { createClient } from "@supabase/supabase-js";
import { buildAbsoluteUrl, SITE_ORGANIZATION_NAME } from "../../lib/seo";

export const dynamic = "force-dynamic";

const GOOGLE_NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getNewsPath(item) {
  const slug = String(item?.slug || "").trim();
  const id = String(item?.id || "").trim();

  if (slug) {
    return `/news/${slug}`;
  }

  if (id) {
    return `/news/${id}`;
  }

  return null;
}

function cleanNewsSitemapTitle(item) {
  const title = String(item?.title || "").trim();

  if (title) {
    return title.slice(0, 150);
  }

  const content = String(item?.content || "")
    .split(/[.!؟\n]/)
    .map((part) => part.trim())
    .find((part) => /[\u0600-\u06FF]/.test(part) && part.length > 18);

  return content ? content.replace(/^عاجل\s*[:：-]?\s*/i, "").slice(0, 150) : "خبر اقتصادي عاجل";
}

function toSitemapIsoDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function isRecentForGoogleNews(createdAt) {
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= GOOGLE_NEWS_WINDOW_MS;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      headers: { "Content-Type": "application/xml" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: news } = await supabase
    .from("news_posts")
    .select("id, slug, title, content, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  const newsUrls = (news || [])
    .map((item) => {
      const path = getNewsPath(item);
      if (!path || !item?.created_at) {
        return null;
      }

      const createdAt = new Date(item.created_at);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }

      const lastModified = toSitemapIsoDate(item.created_at) || createdAt.toISOString();
      const publicationDate = createdAt.toISOString();
      const headline = cleanNewsSitemapTitle(item);
      const googleNewsBlock = isRecentForGoogleNews(item.created_at)
        ? `
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_ORGANIZATION_NAME)}</news:name>
        <news:language>ar</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(publicationDate)}</news:publication_date>
      <news:title>${escapeXml(headline)}</news:title>
    </news:news>`
        : "";

      return `
  <url>
    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>
    <lastmod>${escapeXml(lastModified)}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>${googleNewsBlock}
  </url>`;
    })
    .filter(Boolean)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${newsUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
