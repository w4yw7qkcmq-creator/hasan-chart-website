import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const encryptionSecret = process.env.ACCOUNT_DATA_ENCRYPTION_KEY;

function getEncryptionKey() {
  if (!encryptionSecret || encryptionSecret.length < 24) {
    throw new Error("Missing or weak ACCOUNT_DATA_ENCRYPTION_KEY");
  }

  return crypto.createHash("sha256").update(encryptionSecret).digest();
}

function decryptValue(value) {
  if (!value) return null;

  try {
    const [ivText, authTagText, encryptedText] = String(value).split(":");

    if (!ivText || !authTagText || !encryptedText) {
      return null;
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivText, "base64");
    const authTag = Buffer.from(authTagText, "base64");
    const encrypted = Buffer.from(encryptedText, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Account key decrypt error:", error.message);
    return null;
  }
}

function formatAccountForAdmin(item) {
  return {
    ...item,
    api_key: decryptValue(item.api_key_encrypted),
    secret_key: decryptValue(item.secret_key_encrypted),
    trading_password: decryptValue(item.trading_password_encrypted),
  };
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, error: "جلسة غير صالحة" },
        { status: 401 }
      );
    }

    const normalizedEmail = (user.email || "").toLowerCase();
    const fallbackAdminEmails = [
      "ahmaagahmaadd@gmail.com",
    ];

    const { data: adminProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,role")
      .or(`id.eq.${user.id},email.eq.${normalizedEmail}`)
      .maybeSingle();

    const isAdminByProfile = adminProfile?.role === "admin";
    const isAdminByFallback = fallbackAdminEmails.includes(normalizedEmail);

    if (profileError || (!isAdminByProfile && !isAdminByFallback)) {
      return Response.json(
        { success: false, error: "غير مصرح لك بالدخول" },
        { status: 403 }
      );
    }

    const [analysis, accounts, subscriptions, profiles] = await Promise.all([
      supabase.from("analysis_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("account_management_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("subscription_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("*").limit(500),
    ]);

    if (analysis.error || accounts.error || subscriptions.error || profiles.error) {
      console.error("Admin dashboard data load error:", {
        analysis: analysis.error?.message,
        accounts: accounts.error?.message,
        subscriptions: subscriptions.error?.message,
        profiles: profiles.error?.message,
      });
    }

    return Response.json({
      success: true,
      analysis_requests: analysis.data || [],
      account_management_requests: accounts.data || [],
      subscription_requests: subscriptions.data || [],
      profiles: profiles.data || [],
    });
  } catch (error) {
    console.error("Admin dashboard API error:", error);

    return Response.json(
      {
        success: false,
        error: "حدث خطأ أثناء تحميل البيانات",
      },
      { status: 500 }
    );
  }
}

// --- Secure POST actions for account-management requests ---
async function verifyAdminUserForAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    throw new Error("يجب تسجيل الدخول أولاً");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    throw new Error("جلسة غير صالحة");
  }

  const normalizedEmail = (user.email || "").toLowerCase();
  const fallbackAdminEmails = ["ahmaagahmaadd@gmail.com"];

  const { data: adminProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .or(`id.eq.${user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  const isAdminByProfile = adminProfile?.role === "admin";
  const isAdminByFallback = fallbackAdminEmails.includes(normalizedEmail);

  if (profileError || (!isAdminByProfile && !isAdminByFallback)) {
    throw new Error("غير مصرح لك بالدخول");
  }

  return user;
}

async function writeAdminLog({
  admin,
  action,
  targetTable,
  targetId,
  details = {},
}) {
  try {
    await supabase.from("admin_logs").insert({
      admin_id: admin?.id || null,
      admin_email: admin?.email || null,
      action,
      target_table: targetTable,
      target_id: String(targetId || ""),
      details,
    });
  } catch (error) {
    console.error("Admin log error:", error.message);
  }
}

export async function POST(request) {
  try {
    const adminUser = await verifyAdminUserForAction();

    const payload = await request.json();
    const { action, requestId } = payload;

    if (!action || !requestId) {
      return Response.json(
        { success: false, error: "بيانات الطلب غير مكتملة" },
        { status: 400 }
      );
    }

    if (action === "send-analysis-reply") {
      const reply = String(payload.reply || "").trim();
      const replyImage = String(payload.replyImage || "").trim();

      if (!reply) {
        return Response.json(
          { success: false, error: "الرد مطلوب" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("analysis_requests")
        .update({
          reply,
          reply_image: replyImage || null,
          status: "مكتمل",
        })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر إرسال الرد");
      }

      await writeAdminLog({
        admin: adminUser,
        action: "send-analysis-reply",
        targetTable: "analysis_requests",
        targetId: requestId,
        details: {
          hasImage: Boolean(replyImage),
        },
      });

      return Response.json({ success: true });
    }

    if (action === "delete-analysis-request") {
      const { error } = await supabase
        .from("analysis_requests")
        .delete()
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر حذف طلب التحليل");
      }

      await writeAdminLog({
        admin: adminUser,
        action: "delete-analysis-request",
        targetTable: "analysis_requests",
        targetId: requestId,
      });

      return Response.json({ success: true });
    }

    if (action === "approve-account-request") {
      const { error } = await supabase
        .from("account_management_requests")
        .update({ status: "تمت المراجعة" })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث الطلب");
      }

      await writeAdminLog({
        admin: adminUser,
        action: "approve-account-request",
        targetTable: "account_management_requests",
        targetId: requestId,
      });

      return Response.json({ success: true });
    }

    if (action === "delete-account-request") {
      const { error } = await supabase
        .from("account_management_requests")
        .delete()
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر حذف الطلب");
      }

      await writeAdminLog({
        admin: adminUser,
        action: "delete-account-request",
        targetTable: "account_management_requests",
        targetId: requestId,
      });

      return Response.json({ success: true });
    }

    return Response.json(
      { success: false, error: "إجراء غير معروف" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Admin dashboard action error:", error.message);

    return Response.json(
      { success: false, error: error.message || "تعذر تنفيذ الإجراء" },
      { status: 500 }
    );
  }
}