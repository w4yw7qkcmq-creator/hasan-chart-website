

import { createClient } from "@supabase/supabase-js";


const SITE_URL = "https://www.hasanchartworld.com";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("<urlset></urlset>", {
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
    .map(
      (item) => `
  <url>
    <loc>${SITE_URL}/news/${item.slug || item.id}</loc>
    <lastmod>${new Date(item.created_at).toISOString()}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`
    )
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