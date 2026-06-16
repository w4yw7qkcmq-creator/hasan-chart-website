

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
}

async function getAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    throw new Error("يجب تسجيل الدخول أولاً");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("جلسة غير صالحة");
  }

  const normalizedEmail = (user.email || "").toLowerCase();
  const fallbackAdminEmails = ["ahmaagahmaadd@gmail.com"];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,role")
    .or(`id.eq.${user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  const isAdminByProfile = profile?.role === "admin";
  const isAdminByFallback = fallbackAdminEmails.includes(normalizedEmail);

  if (!isAdminByProfile && !isAdminByFallback) {
    throw new Error("غير مصرح لك بالدخول");
  }

  return user;
}

export async function POST(request) {
  try {
    await getAdminUser();

    const { requestId } = await request.json();

    if (!requestId) {
      return Response.json(
        { success: false, error: "رقم الطلب غير موجود" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("account_management_requests")
      .select("id,api_key_encrypted,secret_key_encrypted,trading_password_encrypted")
      .eq("id", requestId)
      .maybeSingle();

    if (error || !data) {
      return Response.json(
        { success: false, error: "تعذر العثور على الطلب" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      keys: {
        apiKey: decryptValue(data.api_key_encrypted),
        secretKey: decryptValue(data.secret_key_encrypted),
        tradingPassword: decryptValue(data.trading_password_encrypted),
      },
    });
  } catch (error) {
    console.error("Admin account keys API error:", error.message);

    return Response.json(
      {
        success: false,
        error: error.message || "تعذر عرض المفاتيح",
      },
      { status: 500 }
    );
  }
}