import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { accountManagementLimiter, RATE_LIMIT_ERROR } from "../../../lib/rate-limit";
import { getSiteUrl, buildEmailLayout } from "../../../lib/email";
import { buildAdminAccountRequestEmailContent } from "../../../lib/email-layout.js";
import { dispatchTransactionalEmail } from "../../../lib/email-dispatch.js";
import { dispatchAdminSiteNotification } from "../../../lib/site-notification-dispatch.js";
import { readJsonBody } from "../../../lib/request-body";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { nullIfEmptyText } from "../../../lib/text-sanitize";
import {
  sanitizeUploadFileName,
  validateScreenshotMetadata,
} from "../../../lib/upload-validation";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";
const encryptionSecret = process.env.ACCOUNT_DATA_ENCRYPTION_KEY;

async function sendAdminAccountRequestEmail({
  accountManagementRequestId,
  email,
  platform,
  capital,
  accountType,
  contactMethod,
}) {
  if (!accountManagementRequestId) {
    throw new Error("accountManagementRequestId is required");
  }

  const title = "طلب إدارة حساب جديد 📂";
  const content = buildAdminAccountRequestEmailContent({
    email,
    platform,
    capital,
    accountType,
    contactMethod,
  });
  const actionText = "فتح لوحة الإدارة";
  const actionUrl = `${getSiteUrl()}/admin`;

  return dispatchTransactionalEmail({
    idempotencyKey: `admin_account_mgmt_req:${accountManagementRequestId}`,
    recipientEmail: ADMIN_EMAIL,
    subject: "طلب إدارة حساب جديد - HasaN CharT World",
    html: buildEmailLayout({ title, content, actionText, actionUrl }),
    messageType: "admin_account_management_request",
    recordId: accountManagementRequestId,
    metadata: {
      source: "account_management_request",
      accountManagementRequestId,
      userEmail: email,
    },
  });
}

function getEncryptionKey() {
  if (!encryptionSecret || encryptionSecret.length < 24) {
    throw new Error("Missing or weak ACCOUNT_DATA_ENCRYPTION_KEY");
  }

  return crypto.createHash("sha256").update(encryptionSecret).digest();
}

function encryptValue(value) {
  if (!value) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();
    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "جلسة تسجيل الدخول غير صالحة" },
        { status: 401 }
      );
    }

    if (!user?.id || !user?.email) {
      return NextResponse.json(
        { error: "تعذر تحديد حساب المستخدم" },
        { status: 401 }
      );
    }

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: recentRequest } = await supabase
      .from("account_management_requests")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRequest) {
      const nextAllowedAt = new Date(
        new Date(recentRequest.created_at).getTime() +
          24 * 60 * 60 * 1000
      );

      return NextResponse.json(
        {
          error: "يمكنك إرسال طلب إدارة حساب واحد فقط كل 24 ساعة.",
          nextAllowedAt: nextAllowedAt.toISOString(),
        },
        { status: 429 }
      );
    }

    const rateLimitResult = await accountManagementLimiter(user.id);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: RATE_LIMIT_ERROR,
        },
        { status: 429 }
      );
    }

    const body = await readJsonBody(request);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "صيغة الطلب غير صالحة" },
        { status: 400 }
      );
    }

    const platform = nullIfEmptyText(body.platform, 80);
    const accountType = nullIfEmptyText(body.accountType, 80);
    const capital = nullIfEmptyText(body.capital, 80);
    const notes = nullIfEmptyText(body.notes, 2000);
    const contactMethod = nullIfEmptyText(body.contactMethod, 120);

    const apiKey = nullIfEmptyText(body.apiKey, 1000);
    const secretKey = nullIfEmptyText(body.secretKey, 2000);
    const tradingPassword = nullIfEmptyText(body.tradingPassword || body.password, 2000);

    const screenshotFileName = sanitizeUploadFileName(body.screenshotFileName, 255);
    const screenshotMimeType = String(body.screenshotMimeType || "").trim().toLowerCase();
    const screenshotSize = Number(body.screenshotSize || 0);
    const screenshotCheck = validateScreenshotMetadata({
      fileName: screenshotFileName,
      mimeType: screenshotMimeType,
      size: screenshotSize,
    });

    if (!screenshotCheck.ok) {
      const screenshotError =
        screenshotCheck.code === "UPLOAD_TOO_LARGE"
          ? "الحد الأقصى لحجم الصورة هو 15MB."
          : screenshotCheck.code === "DANGEROUS_UPLOAD_FILE"
            ? "نوع الملف غير مسموح."
            : "صيغة الملف المرفوع غير صالحة.";

      return NextResponse.json({ error: screenshotError }, { status: 400 });
    }

    if (!platform || !capital) {
      return NextResponse.json(
        { error: "يرجى إدخال المنصة ورأس المال" },
        { status: 400 }
      );
    }

    const encryptedApiKey = encryptValue(apiKey);
    const encryptedSecretKey = encryptValue(secretKey);
    const encryptedTradingPassword = encryptValue(tradingPassword);

    const { data: insertedRequest, error: insertError } = await supabase
      .from("account_management_requests")
      .insert({
        user_id: user.id,
        email: user.email,
        platform,
        account_type: accountType,
        capital,
        contact_method: contactMethod,
        notes,
        api_key_encrypted: encryptedApiKey,
        secret_key_encrypted: encryptedSecretKey,
        trading_password_encrypted: encryptedTradingPassword,
        status: "جديد",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Account management insert error:", insertError?.message || insertError);
      return NextResponse.json(
        { error: "تعذر إرسال الطلب حالياً" },
        { status: 500 }
      );
    }

    try {
      await dispatchAdminSiteNotification(supabase, {
        preset: "account_management",
        title: "طلب إدارة حساب جديد 📂",
        message: `طلب إدارة حساب جديد من ${user.email} على ${platform}.`,
        url: "/admin",
        metadata: {
          userEmail: user.email,
          platform,
          accountType,
          contactMethod,
        },
      });
    } catch (notificationError) {
      console.error("Admin account notification error:", notificationError?.message || notificationError);
    }

    try {
      const emailResult = await sendAdminAccountRequestEmail({
        accountManagementRequestId: insertedRequest.id,
        email: user.email,
        platform,
        capital,
        accountType,
        contactMethod,
      });

      if (emailResult?.success === false) {
        console.error("Admin account-management email failed:", emailResult);
      }
    } catch (emailError) {
      console.error(
        "Admin account-management email error:",
        emailError?.message || emailError
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account management API error:", error?.message || error);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    );
  }
}