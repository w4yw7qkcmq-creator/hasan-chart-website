import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import { writeAdminAuditLog } from "../../../../../../lib/admin-audit-log";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { loadAdminUserNotesSection } from "../../../../../../lib/admin-user-management-sections";
import {
  buildUnavailableSectionPayload,
  isMissingDatabaseResourceError,
  sanitizeAdminUserFacingError,
} from "../../../../../../lib/admin-user-management-shared";
import { adminMutationLimiter, adminReadLimiter } from "../../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || 1);

    const payload = await loadAdminUserNotesSection(adminCheck.supabase, userId, { page });

    return Response.json(payload, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (error) {
    if (isMissingDatabaseResourceError(error)) {
      const { searchParams } = new URL(request.url);
      const page = Number(searchParams.get("page") || 1);
      return Response.json(buildUnavailableSectionPayload("notes", page), {
        headers: { "Cache-Control": CACHE_NO_STORE },
      });
    }

    const sanitized = sanitizeAdminUserFacingError(error, { fallback: "تعذر تحميل الملاحظات" });
    return Response.json(
      { success: false, error: sanitized.message, errorKind: sanitized.kind },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_NOTES_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const body = await request.json().catch(() => ({}));
    const note = String(body?.note || "").trim();

    if (!note) {
      return Response.json({ success: false, error: "نص الملاحظة مطلوب" }, { status: 400 });
    }

    const { data, error } = await adminCheck.supabase
      .from("admin_user_notes")
      .insert({
        user_id: userId,
        admin_user_id: adminCheck.user?.id || null,
        admin_email: adminCheck.user?.email || null,
        note,
      })
      .select("id,user_id,admin_user_id,admin_email,note,created_at,updated_at")
      .single();

    if (error) throw error;

    await writeAdminAuditLog(adminCheck.supabase, {
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
      targetUserId: userId,
      action: "add_admin_note",
      entityType: "admin_user_notes",
      entityId: data.id,
      afterData: { id: data.id },
    });

    return Response.json({ success: true, note: data });
  } catch (error) {
    const sanitized = sanitizeAdminUserFacingError(error, { fallback: "تعذر إضافة الملاحظة" });
    return Response.json(
      { success: false, error: sanitized.message, errorKind: sanitized.kind },
      { status: isMissingDatabaseResourceError(error) ? 503 : error?.status || 500 }
    );
  }
}

export async function PATCH(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_NOTES_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const body = await request.json().catch(() => ({}));
    const noteId = String(body?.noteId || "").trim();
    const note = body?.note !== undefined ? String(body.note || "").trim() : undefined;
    const isPinned = typeof body?.isPinned === "boolean" ? body.isPinned : undefined;

    if (!noteId) {
      return Response.json({ success: false, error: "معرّف الملاحظة مطلوب" }, { status: 400 });
    }

    if (note === undefined && isPinned === undefined) {
      return Response.json({ success: false, error: "لا يوجد تحديث لإرساله" }, { status: 400 });
    }

    if (note !== undefined && !note) {
      return Response.json({ success: false, error: "نص الملاحظة مطلوب" }, { status: 400 });
    }

    const { data: before } = await adminCheck.supabase
      .from("admin_user_notes")
      .select("id,note")
      .eq("id", noteId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const { data, error } = await adminCheck.supabase
      .from("admin_user_notes")
      .update({
        ...(note !== undefined ? { note } : {}),
        ...(isPinned !== undefined ? { is_pinned: isPinned } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("user_id", userId)
      .select("id,user_id,admin_user_id,admin_email,note,is_pinned,created_at,updated_at")
      .single();

    if (error) throw error;

    await writeAdminAuditLog(adminCheck.supabase, {
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
      targetUserId: userId,
      action: "update_admin_note",
      entityType: "admin_user_notes",
      entityId: noteId,
      beforeData: before,
      afterData: data,
    });

    return Response.json({ success: true, note: data });
  } catch (error) {
    const sanitized = sanitizeAdminUserFacingError(error, { fallback: "تعذر تحديث الملاحظة" });
    return Response.json(
      { success: false, error: sanitized.message, errorKind: sanitized.kind },
      { status: isMissingDatabaseResourceError(error) ? 503 : error?.status || 500 }
    );
  }
}

export async function DELETE(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.USERS_NOTES_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    const userId = String(params?.userId || "").trim();
    const { searchParams } = new URL(request.url);
    const noteId = String(searchParams.get("noteId") || "").trim();

    if (!noteId) {
      return Response.json({ success: false, error: "معرّف الملاحظة مطلوب" }, { status: 400 });
    }

    const { data: before } = await adminCheck.supabase
      .from("admin_user_notes")
      .select("id,note")
      .eq("id", noteId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data, error } = await adminCheck.supabase
      .from("admin_user_notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error) throw error;

    await writeAdminAuditLog(adminCheck.supabase, {
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
      targetUserId: userId,
      action: "delete_admin_note",
      entityType: "admin_user_notes",
      entityId: noteId,
      beforeData: before,
      afterData: data,
    });

    return Response.json({ success: true });
  } catch (error) {
    const sanitized = sanitizeAdminUserFacingError(error, { fallback: "تعذر حذف الملاحظة" });
    return Response.json(
      { success: false, error: sanitized.message, errorKind: sanitized.kind },
      { status: isMissingDatabaseResourceError(error) ? 503 : error?.status || 500 }
    );
  }
}
