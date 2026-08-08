import { createClient } from "@supabase/supabase-js";
import { buildAbsoluteUrl } from "../../../lib/seo";

export const dynamic = "force-dynamic";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getContentPath(item) {
  const slug = String(item?.slug || "").trim();
  if (!slug) return null;
  if (item.content_type === "academy") return `/academy/${slug}`;
  if (item.content_type === "result") return `/results/${slug}`;
  return null;
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
  const { data: posts } = await supabase
    .from("content_posts")
    .select("content_type, slug, updated_at, published_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(1000);

  const urls = (posts || [])
    .map((item) => {
      const path = getContentPath(item);
      if (!path) return null;
      const lastmod = new Date(item.updated_at || item.published_at || Date.now()).toISOString();
      return `
  <url>
    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .filter(Boolean)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
