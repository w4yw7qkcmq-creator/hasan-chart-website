import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import { writeAdminAuditLog } from "../../../../../../lib/admin-audit-log";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { loadAdminUserNotesSection } from "../../../../../../lib/admin-user-management-sections";
import { adminMutationLimiter, adminReadLimiter } from "../../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const adminCheck = await verifyAdminSession();
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
    return Response.json(
      { success: false, error: error?.message || "تعذر تحميل الملاحظات" },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request, context) {
  try {
    const adminCheck = await verifyAdminSession();
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
    return Response.json(
      { success: false, error: error?.message || "تعذر إضافة الملاحظة" },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(request, context) {
  try {
    const adminCheck = await verifyAdminSession();
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
    const note = String(body?.note || "").trim();

    if (!noteId || !note) {
      return Response.json({ success: false, error: "معرّف الملاحظة والنص مطلوبان" }, { status: 400 });
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
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("user_id", userId)
      .select("id,user_id,admin_user_id,admin_email,note,created_at,updated_at")
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
    return Response.json(
      { success: false, error: error?.message || "تعذر تحديث الملاحظة" },
      { status: error?.status || 500 }
    );
  }
}

export async function DELETE(request, context) {
  try {
    const adminCheck = await verifyAdminSession();
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
    return Response.json(
      { success: false, error: error?.message || "تعذر حذف الملاحظة" },
      { status: error?.status || 500 }
    );
  }
}
