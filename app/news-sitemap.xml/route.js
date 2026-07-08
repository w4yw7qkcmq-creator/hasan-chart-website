import { createClient } from "@supabase/supabase-js";
import { buildAbsoluteUrl } from "../../lib/seo";

export const dynamic = "force-dynamic";

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
    .select("id, slug, created_at")
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

      return `
  <url>
    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>
    <lastmod>${escapeXml(createdAt.toISOString())}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`;
    })
    .filter(Boolean)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${newsUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
