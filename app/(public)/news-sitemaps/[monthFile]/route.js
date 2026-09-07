import { notFound } from "next/navigation";
import { buildArchiveSitemapPartitions, getNewsSupabaseClient } from "../../../../lib/news-archive-data";
import {
  buildNewsSitemapUrlEntry,
  buildUrlsetXml,
  parseArchiveMonthFile,
  SITEMAP_XML_HEADERS,
} from "../../../../lib/news-sitemap-shared";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const monthKey = parseArchiveMonthFile(resolvedParams?.monthFile);

  if (!monthKey) {
    notFound();
  }

  const supabase = getNewsSupabaseClient();
  if (!supabase) {
    return new Response(buildUrlsetXml([]), {
      headers: SITEMAP_XML_HEADERS,
    });
  }

  const partitions = await buildArchiveSitemapPartitions();
  const items = partitions.get(monthKey) || [];

  const urlEntries = items.map((item) =>
    buildNewsSitemapUrlEntry({
      path: item.path,
      lastModified: item.created_at,
      changefreq: "monthly",
      priority: "0.6",
    })
  );

  return new Response(buildUrlsetXml(urlEntries), {
    headers: SITEMAP_XML_HEADERS,
  });
}
