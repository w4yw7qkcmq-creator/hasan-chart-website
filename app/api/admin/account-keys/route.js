import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { verifyAdminSession } from "../../../../lib/admin-auth";

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

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const supabase = getAdminSupabase();
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
    console.error("Admin account keys API error");

    return Response.json(
      {
        success: false,
        error: "تعذر عرض المفاتيح",
      },
      { status: 500 }
    );
  }
}
