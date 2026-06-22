import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { accountManagementLimiter } from "../../../lib/rate-limit";
import { getSiteUrl, sendTemplateEmail } from "../../../lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionSecret = process.env.ACCOUNT_DATA_ENCRYPTION_KEY;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";

async function sendAdminAccountRequestEmail({
  email,
  platform,
  capital,
  accountType,
  contactMethod,
}) {
  await sendTemplateEmail({
    to: ADMIN_EMAIL,
    subject: "طلب إدارة حساب جديد - HasaN CharT World",
    title: "طلب إدارة حساب جديد 📂",
    content: `
      <p>وصل طلب إدارة حساب جديد من أحد المستخدمين.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;line-height:1.9">
        <p><strong>البريد:</strong> ${email}</p>
        <p><strong>المنصة:</strong> ${platform}</p>
        <p><strong>رأس المال:</strong> ${capital}</p>
        <p><strong>نوع الحساب:</strong> ${accountType || "غير محدد"}</p>
        <p><strong>طريقة التواصل:</strong> ${contactMethod || "غير محددة"}</p>
      </div>
    `,
    actionText: "فتح لوحة الإدارة",
    actionUrl: `${getSiteUrl()}/admin`,
  });
}

function getAdminSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase server configuration");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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

function sanitizeText(value, maxLength = 2000) {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength);
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const supabase = getAdminSupabase();
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

    const rateLimitResult = accountManagementLimiter(user.id);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "يمكنك إرسال طلب إدارة حساب واحد فقط كل 24 ساعة.",
        },
        { status: 429 }
      );
    }

    const body = await safeJson(request);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "صيغة الطلب غير صالحة" },
        { status: 400 }
      );
    }

    const platform = sanitizeText(body.platform, 80);
    const accountType = sanitizeText(body.accountType, 80);
    const capital = sanitizeText(body.capital, 80);
    const notes = sanitizeText(body.notes, 2000);
    const contactMethod = sanitizeText(body.contactMethod, 120);

    const apiKey = sanitizeText(body.apiKey, 1000);
    const secretKey = sanitizeText(body.secretKey, 2000);
    const tradingPassword = sanitizeText(body.tradingPassword || body.password, 2000);

    const screenshotFileName = sanitizeText(body.screenshotFileName, 255);
    const screenshotMimeType = sanitizeText(body.screenshotMimeType, 120);
    const screenshotSize = Number(body.screenshotSize || 0);

    if (Number.isNaN(screenshotSize) || screenshotSize < 0) {
      return NextResponse.json(
        { error: "حجم الصورة غير صالح" },
        { status: 400 }
      );
    }

    if (screenshotFileName || screenshotMimeType || screenshotSize) {
      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(screenshotMimeType)) {
        return NextResponse.json(
          {
            error: "يسمح فقط برفع صور JPG أو PNG أو WEBP.",
          },
          { status: 400 }
        );
      }

      if (screenshotSize > 15 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: "الحد الأقصى لحجم الصورة هو 15MB.",
          },
          { status: 400 }
        );
      }
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

    const { error: insertError } = await supabase
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
        status: "pending",
      });

    if (insertError) {
      console.error("Account management insert error:", insertError?.message || insertError);
      return NextResponse.json(
        { error: "تعذر إرسال الطلب حالياً" },
        { status: 500 }
      );
    }

    sendAdminAccountRequestEmail({
      email: user.email,
      platform,
      capital,
      accountType,
      contactMethod,
    }).catch((emailError) => {
      console.error(
        "Admin account-management email error:",
        emailError?.message || emailError
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account management API error:", error?.message || error);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    );
  }
}