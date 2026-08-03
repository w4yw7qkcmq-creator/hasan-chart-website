import crypto from "crypto";
import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { requireValidUuid } from "../../../../lib/partner-security";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

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
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.ACCOUNTS_SECRETS_MANAGE, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const requestId = requireValidUuid(body?.requestId, "request_id");

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
