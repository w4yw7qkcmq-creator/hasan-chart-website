import { getArchiveSitemapIndexPartitions, getNewsSupabaseClient } from "../../../lib/news-archive-data";
import {
  buildSitemapIndexEntry,
  buildSitemapIndexXml,
  getArchiveSitemapChildUrl,
  SITEMAP_XML_HEADERS,
} from "../../../lib/news-sitemap-shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getNewsSupabaseClient();

  if (!supabase) {
    return new Response(buildSitemapIndexXml([]), {
      headers: SITEMAP_XML_HEADERS,
    });
  }

  const partitions = await getArchiveSitemapIndexPartitions();
  const monthKeys = Array.from(partitions.keys()).sort();

  const entries = monthKeys.map((monthKey) => {
    const items = partitions.get(monthKey) || [];
    const newest = items[0]?.created_at;
    return buildSitemapIndexEntry(getArchiveSitemapChildUrl(monthKey), newest);
  });

  return new Response(buildSitemapIndexXml(entries), {
    headers: SITEMAP_XML_HEADERS,
  });
}
