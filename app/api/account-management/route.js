

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionSecret = process.env.ACCOUNT_DATA_ENCRYPTION_KEY;

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

export async function POST(request) {
  try {
    const supabase = getAdminSupabase();
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

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

    const body = await request.json();

    const platform = sanitizeText(body.platform, 80);
    const accountType = sanitizeText(body.accountType, 80);
    const capital = sanitizeText(body.capital, 80);
    const notes = sanitizeText(body.notes, 2000);
    const contactMethod = sanitizeText(body.contactMethod, 120);

    const apiKey = sanitizeText(body.apiKey, 1000);
    const secretKey = sanitizeText(body.secretKey, 2000);
    const tradingPassword = sanitizeText(body.tradingPassword || body.password, 2000);

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
      console.error("Account management insert error:", insertError.message);
      return NextResponse.json(
        { error: "تعذر إرسال الطلب حالياً" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account management API error:", error.message);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    );
  }
}