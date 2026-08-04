import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";
import {
  IAM_SECURITY_DETAIL_COLUMNS,
  IAM_SECURITY_LIST_COLUMNS,
} from "../../../../lib/iam/list-columns.js";
import {
  applyCreatedAtIdCursor,
  buildIamListResponse,
  buildPaginationResult,
  IAM_LIST_LIMITS,
  mapSecurityListRow,
  parseIamListParams,
} from "../../../../lib/iam/list-api-helpers.js";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": CACHE_NO_STORE },
  });
}

async function loadProfiles(supabase, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id,email").in("id", ids);
  return Object.fromEntries((data || []).map((row) => [row.id, row]));
}

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_SECURITY_READ, { request });
    if (!adminCheck.ok) {
      return json({ success: false, error: adminCheck.error }, adminCheck.status);
    }

    const { searchParams } = new URL(request.url);
    let params;
    try {
      params = parseIamListParams(searchParams, IAM_LIST_LIMITS.security);
    } catch (error) {
      if (error?.code === "INVALID_CURSOR") {
        return json({ success: false, error: "Invalid cursor" }, 400);
      }
      throw error;
    }
    const severity = searchParams.get("severity");
    const eventType = searchParams.get("eventType");

    if (params.id) {
      const { data, error } = await adminCheck.supabase
        .from("iam_security_events")
        .select(params.includeMetadata ? IAM_SECURITY_DETAIL_COLUMNS : IAM_SECURITY_LIST_COLUMNS)
        .eq("id", params.id)
        .limit(1);

      if (error) {
        if (/relation .* does not exist/i.test(error.message || "")) {
          return json({ success: true, item: null, tableMissing: true });
        }
        throw error;
      }

      const row = data?.[0] || null;
      const profiles = row?.user_id ? await loadProfiles(adminCheck.supabase, [row.user_id]) : {};
      return json({
        success: true,
        item: row ? (params.includeMetadata ? row : mapSecurityListRow(row, profiles)) : null,
      });
    }

    const fetchLimit = params.limit + 1;
    let query = adminCheck.supabase
      .from("iam_security_events")
      .select(IAM_SECURITY_LIST_COLUMNS, params.includeTotal ? { count: "exact" } : undefined)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (severity) query = query.eq("severity", severity);
    if (eventType) query = query.eq("event_type", eventType);

    query = applyCreatedAtIdCursor(query, params.cursor);
    query = query.limit(fetchLimit);

    const { data, error, count } = await query;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return json(buildIamListResponse({ items: [], pagination: { limit: params.limit, hasMore: false, nextCursor: null }, legacyKey: "events", legacyItems: [], tableMissing: true }));
      }
      throw error;
    }

    const { items, pagination } = buildPaginationResult(data || [], params.limit);
    const profiles = await loadProfiles(adminCheck.supabase, items.map((row) => row.user_id));
    const mapped = items.map((row) => mapSecurityListRow(row, profiles));

    if (params.includeTotal && typeof count === "number") {
      pagination.total = count;
    }

    return json(buildIamListResponse({
      items: mapped,
      pagination,
      legacyKey: "events",
      legacyItems: mapped,
    }));
  } catch (error) {
    return json({ success: false, error: error?.message }, 500);
  }
}
