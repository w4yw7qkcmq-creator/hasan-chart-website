import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";
import {
  IAM_AUDIT_DETAIL_COLUMNS,
  IAM_AUDIT_LIST_COLUMNS,
} from "../../../../lib/iam/list-columns.js";
import {
  applyCreatedAtIdCursor,
  buildIamListResponse,
  buildPaginationResult,
  IAM_LIST_LIMITS,
  mapAuditListRow,
  parseIamListParams,
} from "../../../../lib/iam/list-api-helpers.js";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_AUDIT_READ, { request });
    if (!adminCheck.ok) {
      return json({ success: false, error: adminCheck.error }, adminCheck.status);
    }

    const { searchParams } = new URL(request.url);
    let params;
    try {
      params = parseIamListParams(searchParams, IAM_LIST_LIMITS.audit);
    } catch (error) {
      if (error?.code === "INVALID_CURSOR") {
        return json({ success: false, error: "Invalid cursor" }, 400);
      }
      throw error;
    }
    const action = searchParams.get("action");
    const actorId = searchParams.get("actorId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (params.id) {
      let detailQuery = adminCheck.supabase
        .from("iam_audit_logs")
        .select(params.includeMetadata ? IAM_AUDIT_DETAIL_COLUMNS : IAM_AUDIT_LIST_COLUMNS)
        .eq("id", params.id)
        .limit(1);

      const { data, error } = await detailQuery;
      if (error) {
        if (/relation .* does not exist/i.test(error.message || "")) {
          return json({ success: true, item: null, tableMissing: true });
        }
        throw error;
      }

      const row = data?.[0] || null;
      return json({
        success: true,
        item: row ? (params.includeMetadata ? row : mapAuditListRow(row)) : null,
      });
    }

    const fetchLimit = params.limit + 1;
    let query = adminCheck.supabase
      .from("iam_audit_logs")
      .select(IAM_AUDIT_LIST_COLUMNS, params.includeTotal ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (action) query = query.eq("action", action);
    if (actorId) query = query.eq("actor_id", actorId);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    query = applyCreatedAtIdCursor(query, params.cursor);
    query = query.limit(fetchLimit);

    const { data, error, count } = await query;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return json(buildIamListResponse({ items: [], pagination: { limit: params.limit, hasMore: false, nextCursor: null }, legacyKey: "logs", legacyItems: [], tableMissing: true }));
      }
      throw error;
    }

    const { items, pagination } = buildPaginationResult(data || [], params.limit);
    const mapped = items.map(mapAuditListRow);
    if (params.includeTotal && typeof count === "number") {
      pagination.total = count;
    }

    return json(buildIamListResponse({
      items: mapped,
      pagination,
      legacyKey: "logs",
      legacyItems: mapped,
    }));
  } catch (error) {
    return json({ success: false, error: error?.message }, 500);
  }
}
