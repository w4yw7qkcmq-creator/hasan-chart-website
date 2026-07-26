import { NextResponse } from "next/server";
import { CACHE_PUBLIC_CONTENT, jsonError, jsonOk } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import { verifyAdminSession } from "../../../lib/admin-auth";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { adminMutationLimiter, getClientIp } from "../../../lib/rate-limit";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { invalidateReadCache, withReadCache } from "../../../lib/server-read-cache";
import { DAILY_ANALYSIS_API_CACHE_MS } from "../../../lib/public-cache-config";
import { DAILY_ANALYSIS_COLUMNS } from "../../../lib/supabase-query-columns";
import { trimText } from "../../../lib/text-sanitize";

export const dynamic = "force-dynamic";

const VALID_DIRECTIONS = new Set(["bullish", "bearish", "neutral"]);
const VALID_ANALYSIS_TYPES = new Set(["daily", "weekly", "urgent"]);

function sanitizeText(value, maxLength = 12000) {
  return trimText(value, maxLength);
}

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

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/daily-analysis",
    handler: async (_req, logContext) => {
      try {
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

      return {
        success: true,
        tableReady: true,
        analyses: (rows || []).map(normalizeItem).filter(Boolean),
      };
    });

        return jsonOk(data, { cacheControl: CACHE_PUBLIC_CONTENT });
      } catch (error) {
        return jsonError(error, 500, {
          logContext: { ...logContext, forceLog: true },
        });
      }
    },
  });
}

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return NextResponse.json(
        { success: false, error: adminCheck.error || "غير مصرح لك بالنشر." },
        { status: adminCheck.status || 403 }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || getClientIp(request)).toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));
    const title = sanitizeText(body.title, 240);
    const symbol = sanitizeText(body.symbol, 80);
    const direction = sanitizeText(body.direction, 20).toLowerCase();
    const analysisType = sanitizeText(body.analysis_type || body.analysisType, 20).toLowerCase();
    const content = sanitizeText(body.content, 12000);
    const notes = sanitizeText(body.notes, 2000);

    if (!title) {
      return NextResponse.json(
        { success: false, error: "العنوان مطلوب." },
        { status: 400 }
      );
    }

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "العملة / السوق مطلوب." },
        { status: 400 }
      );
    }

    if (!VALID_DIRECTIONS.has(direction)) {
      return NextResponse.json(
        { success: false, error: "الاتجاه غير صالح." },
        { status: 400 }
      );
    }

    if (!VALID_ANALYSIS_TYPES.has(analysisType)) {
      return NextResponse.json(
        { success: false, error: "نوع التحليل غير صالح." },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { success: false, error: "نص التحليل مطلوب." },
        { status: 400 }
      );
    }

    const supabase = adminCheck.supabase || getSupabaseAdmin();
    const createdBy = String(adminCheck.user?.email || "").trim().toLowerCase();

    const { data, error } = await supabase
      .from("daily_analysis")
      .insert({
        title,
        symbol,
        direction,
        analysis_type: analysisType,
        content,
        notes: notes || null,
        created_by: createdBy,
        published: true,
      })
      .select(DAILY_ANALYSIS_COLUMNS)
      .single();

    if (error) {
      const missingTable =
        error.code === "42P01" ||
        /daily_analysis/i.test(error.message || "") ||
        /does not exist/i.test(error.message || "");

      if (missingTable) {
        return NextResponse.json(
          {
            success: false,
            error: "جدول daily_analysis غير موجود. نفّذ migration في Supabase أولاً.",
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { success: false, error: error.message || "تعذر نشر التحليل." },
        { status: 500 }
      );
    }

    invalidateReadCache("public:daily-analysis");

    return NextResponse.json({
      success: true,
      analysis: normalizeItem(data),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
