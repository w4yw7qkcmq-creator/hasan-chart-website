import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit.js";
import { adminReadLimiter } from "../../../../lib/rate-limit.js";
import { withReadCache } from "../../../../lib/server-read-cache.js";
import { FINANCIAL_OVERVIEW_CACHE_MS, exportRowsToCsv, sanitizeFinancialError } from "../../../../lib/financial-center/financial-center-shared.js";
import { FINANCIAL_CENTER_SECTIONS } from "../../../../lib/financial-center/financial-types.js";
import { decodeCursor } from "../../../../lib/pagination.js";
import { listPaymentReviews } from "../../../../lib/financial-center/payment-service.js";
import { getFinancialOverview, getFinancialRevenueReport } from "../../../../lib/financial-center/revenue-service.js";
import {
  getRecentFinancialSubscriptions,
  listFinancialSubscriptions,
} from "../../../../lib/financial-center/subscription-service.js";

export const dynamic = "force-dynamic";

function parseFilters(searchParams) {
  return {
    status: String(searchParams.get("status") || "all"),
    service: String(searchParams.get("service") || "all"),
    source: String(searchParams.get("source") || "all"),
    paid: String(searchParams.get("paid") || "all"),
    startedFrom: String(searchParams.get("startedFrom") || ""),
    startedTo: String(searchParams.get("startedTo") || ""),
    expiresFrom: String(searchParams.get("expiresFrom") || ""),
    expiresTo: String(searchParams.get("expiresTo") || ""),
  };
}

function jsonResponse(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": CACHE_NO_STORE,
      Vary: "Accept-Encoding",
    },
  });
}

export async function GET(request) {
  try {
    const access = await requireAdminPermission(IAM_PERMISSIONS.FINANCE_READ, { request });
    if (!access.ok) {
      return jsonResponse({ success: false, error: access.error }, access.status);
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(access.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const section = String(searchParams.get("section") || "overview").trim().toLowerCase();
    const exportMode = String(searchParams.get("export") || "").trim().toLowerCase() === "csv";

    if (!FINANCIAL_CENTER_SECTIONS.has(section)) {
      return jsonResponse({ success: false, error: "قسم غير مدعوم" }, 400);
    }

    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 25);
    const cursor = String(searchParams.get("cursor") || "").trim() || null;
    const includeTotal = searchParams.get("includeTotal") === "true";
    const search = String(searchParams.get("search") || "");
    const period = String(searchParams.get("period") || "30d");
    const filters = parseFilters(searchParams);

    if (cursor) {
      try {
        decodeCursor(cursor);
      } catch {
        return jsonResponse({ success: false, error: "مؤشر الصفحة غير صالح" }, 400);
      }
    }

    if (section === "overview") {
      const adminEmail = String(access.user?.email || "admin").toLowerCase();
      const { data } = await withReadCache(
        `financial-center:overview:${adminEmail}`,
        FINANCIAL_OVERVIEW_CACHE_MS,
        async () => {
          const overview = await getFinancialOverview(access.supabase);
          const [recentActive, recentPending] = await Promise.all([
            getRecentFinancialSubscriptions(access.supabase, { kind: "active", limit: 5 }),
            getRecentFinancialSubscriptions(access.supabase, { kind: "pending", limit: 5 }),
          ]);
          return { overview, recentActive, recentPending };
        }
      );

      return jsonResponse({
        success: true,
        section,
        ...data,
      });
    }

    if (section === "subscriptions") {
      const result = await listFinancialSubscriptions(access.supabase, {
        page,
        pageSize,
        cursor,
        search,
        filters,
        exportMode,
        includeTotal,
      });

      if (exportMode) {
        if ((result.items?.length || 0) > 500) {
          return jsonResponse(
            {
              success: false,
              error: "عدد النتائج كبير جداً للتصدير. يرجى تضييق الفلاتر.",
            },
            400
          );
        }

        const csv = exportRowsToCsv(
          [
            "id",
            "userEmail",
            "username",
            "service",
            "plan",
            "status",
            "priceRaw",
            "priceAmount",
            "currency",
            "source",
            "startedAt",
            "expiresAt",
            "paymentProofAvailable",
          ],
          result.items.map((item) => [
            item.id,
            item.userEmail,
            item.username,
            item.service,
            item.plan,
            item.status,
            item.priceRaw,
            item.priceAmount,
            item.currency,
            item.source,
            item.startedAt,
            item.expiresAt,
            item.paymentProofAvailable ? "yes" : "no",
          ])
        );

        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="financial-subscriptions.csv"',
            "Cache-Control": CACHE_NO_STORE,
          },
        });
      }

      return jsonResponse({ success: true, section, ...result });
    }

    if (section === "payment-reviews") {
      const reviewStatus = String(searchParams.get("reviewStatus") || "all");
      const result = await listPaymentReviews(access.supabase, {
        page,
        pageSize,
        cursor,
        search,
        status: reviewStatus,
        exportMode,
        includeTotal,
      });

      if (exportMode) {
        const csv = exportRowsToCsv(
          [
            "requestId",
            "userEmail",
            "username",
            "plan",
            "priceRaw",
            "amount",
            "currency",
            "status",
            "submittedAt",
            "confirmedAt",
            "proofAvailable",
          ],
          result.items.map((item) => [
            item.requestId,
            item.userEmail,
            item.username,
            item.plan,
            item.priceRaw,
            item.amount,
            item.currency,
            item.status,
            item.submittedAt,
            item.confirmedAt,
            item.proofAvailable ? "yes" : "no",
          ])
        );

        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="financial-payment-reviews.csv"',
            "Cache-Control": CACHE_NO_STORE,
          },
        });
      }

      return jsonResponse({ success: true, section, ...result });
    }

    if (section === "revenue") {
      const report = await getFinancialRevenueReport(access.supabase, { period });

      if (exportMode) {
        const csvRows = [];
        for (const day of report.daily) {
          csvRows.push([
            day.date,
            day.activatedCount,
            day.revenue.USD,
            day.revenue.USDT,
          ]);
        }

        const csv = exportRowsToCsv(
          ["date", "activatedCount", "revenueUSD", "revenueUSDT"],
          csvRows
        );

        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="financial-revenue-daily.csv"',
            "Cache-Control": CACHE_NO_STORE,
          },
        });
      }

      return jsonResponse({ success: true, section, report });
    }

    return jsonResponse({ success: false, error: "قسم غير مدعوم" }, 400);
  } catch (error) {
    console.error("Financial center API error:", error?.message || error);
    return jsonResponse(
      {
        success: false,
        error: sanitizeFinancialError(error),
      },
      error?.status || 500
    );
  }
}
