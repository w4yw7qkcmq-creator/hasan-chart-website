import { DAILY_ANALYSIS_API_CACHE_MS } from "../public-cache-config";
import { fetchTelegramDailyAnalysisItems } from "../public-section-feed/index.js";
import { mergeFeedItemsByPublishedAt } from "../public-section-feed/merge.js";
import { withReadCache } from "../server-read-cache";
import { getSupabaseAdmin } from "../supabase-admin";
import { DAILY_ANALYSIS_COLUMNS } from "../supabase-query-columns";

function normalizeItem(row) {
  if (!row?.id) return null;

  return {
    id: row.id,
    title: row.title || "",
    symbol: row.symbol || "",
    direction: row.direction || "neutral",
    analysisType: row.analysis_type || "daily",
    content: row.content || "",
    notes: row.notes || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    published: Boolean(row.published),
  };
}

export async function getPublicDailyAnalyses() {
  const { data } = await withReadCache("public:daily-analysis", DAILY_ANALYSIS_API_CACHE_MS, async () => {
    const supabase = getSupabaseAdmin();

    const { data: rows, error } = await supabase
      .from("daily_analysis")
      .select(DAILY_ANALYSIS_COLUMNS)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      const missingTable =
        error.code === "42P01" ||
        /daily_analysis/i.test(error.message || "") ||
        /does not exist/i.test(error.message || "");

      if (missingTable) {
        return {
          success: true,
          analyses: [],
        };
      }

      throw new Error(error.message || "تعذر تحميل التحليلات.");
    }

    const manualAnalyses = (rows || []).map(normalizeItem).filter(Boolean);
    const telegramAnalyses = await fetchTelegramDailyAnalysisItems();
    const analyses = mergeFeedItemsByPublishedAt([...manualAnalyses, ...telegramAnalyses], {
      cap: 100,
    });

    return {
      success: true,
      tableReady: true,
      analyses,
    };
  });

  return data;
}
