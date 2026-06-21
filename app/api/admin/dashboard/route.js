import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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
    const supabase = getAdminSupabase();

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

    if (!isAdminByFallback && (profileError || !isAdminByProfile)) {
      return Response.json(
        { success: false, error: "غير مصرح لك بالدخول" },
        { status: 403 }
      );
    }

    const [analysis, accounts, subscriptions, profiles] = await Promise.all([
      supabase
        .from("analysis_requests")
        .select(
          "id,user_email,username,coin,frame,status,reply,created_at,job_status,processing_started_at,completed_at,failed_at,error_message,attempts"
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("account_management_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("subscription_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("*").limit(500),
    ]);

    const tableErrors = {
      analysis: analysis.error?.message || null,
      accounts: accounts.error?.message || null,
      subscriptions: subscriptions.error?.message || null,
      profiles: profiles.error?.message || null,
    };

    if (analysis.error || accounts.error || subscriptions.error || profiles.error) {
      console.error("Admin dashboard data load error:", tableErrors);

      return Response.json(
        {
          success: false,
          error: "فشل تحميل بعض بيانات لوحة الإدارة",
          tableErrors,
        },
        { status: 500 }
      );
    }

    console.log("Admin dashboard counts:", {
      analysis: analysis.data?.length || 0,
      accounts: accounts.data?.length || 0,
      subscriptions: subscriptions.data?.length || 0,
      profiles: profiles.data?.length || 0,
    });

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
async function verifyAdminUserForAction(supabase) {
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

  if (!isAdminByFallback && (profileError || !isAdminByProfile)) {
    throw new Error("غير مصرح لك بالدخول");
  }

  return user;
}

async function writeAdminLog(supabase, {
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
    const supabase = getAdminSupabase();

    const adminUser = await verifyAdminUserForAction(supabase);

    const payload = await request.json();
    const { action, requestId } = payload;

    if (!action || !requestId) {
      return Response.json(
        { success: false, error: "بيانات الطلب غير مكتملة" },
        { status: 400 }
      );
    }

    if (action === "publish-vip-signal") {
      const signalType = String(payload.signalType || "").trim();
      const coin = String(payload.coin || "").trim().toUpperCase();
      const entry = String(payload.entry || "").trim();
      const targets = String(payload.targets || "").trim();
      const stopLoss = String(payload.stopLoss || "").trim();
      const notes = String(payload.notes || "").trim();

      if (!signalType || !coin) {
        return Response.json(
          { success: false, error: "نوع التوصية واسم العملة مطلوبان" },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("vip_signals")
        .insert({
          signal_type: signalType,
          coin,
          entry,
          targets,
          stop_loss: stopLoss,
          notes,
          status: "نشطة",
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message || "فشل نشر توصية VIP");
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "publish-vip-signal",
        targetTable: "vip_signals",
        targetId: data?.id || requestId,
        details: {
          signalType,
          coin,
        },
      });

      return Response.json({ success: true, id: data?.id || null });
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

      await writeAdminLog(supabase, {
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

    if (action === "update-subscription-request") {
      const newStatus = String(payload.status || "").trim();
      const userEmail = String(payload.userEmail || "").trim().toLowerCase();
      const planName = String(payload.planName || "").trim();

      if (!newStatus) {
        return Response.json(
          { success: false, error: "حالة الاشتراك مطلوبة" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("subscription_requests")
        .update({ status: newStatus })
        .eq("id", requestId);

      if (error) {
        throw new Error(error.message || "تعذر تحديث طلب الاشتراك");
      }

      if (newStatus === "مفعل" && userEmail) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            subscription_plan: planName || "اشتراك مفعل",
            subscription_status: "نشط",
          })
          .eq("email", userEmail);

        if (profileError) {
          throw new Error(
            profileError.message || "تم تحديث الطلب لكن تعذر تفعيل اشتراك المستخدم"
          );
        }

        await supabase.from("notifications").insert({
          user_email: userEmail,
          title: "تم تفعيل اشتراكك بنجاح 🎉",
          message: `تم تفعيل اشتراك ${planName || "الخاص بك"} ويمكنك الآن استخدام جميع المزايا المتاحة.`,
          type: "subscription",
          is_read: false,
        });
      }

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "update-subscription-request",
        targetTable: "subscription_requests",
        targetId: requestId,
        details: {
          status: newStatus,
          userEmail,
          planName,
        },
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

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "approve-account-request",
        targetTable: "account_management_requests",
        targetId: requestId,
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

      await writeAdminLog(supabase, {
        admin: adminUser,
        action: "delete-analysis-request",
        targetTable: "analysis_requests",
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

      await writeAdminLog(supabase, {
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