const ALLOWED_HOSTNAMES = new Set([
  "hasanchartworld.com",
  "www.hasanchartworld.com",
  "localhost",
]);

export const TURNSTILE_REGISTRATION_ERROR_AR =
  "تعذر التحقق من أنك مستخدم حقيقي. حاول مرة أخرى.";

export async function verifyTurnstileTokenServer({ token, remoteIp }) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKeyConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  if (!siteKeyConfigured) {
    return { ok: true, skipped: true };
  }

  if (!secret) {
    return { ok: false, error: "خطأ في إعدادات الحماية الأمنية.", status: 500 };
  }

  if (!token || typeof token !== "string") {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 400 };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  const verifyResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!verifyResponse.ok) {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 502 };
  }

  const result = await verifyResponse.json();
  if (!result?.success) {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 403 };
  }

  if (!ALLOWED_HOSTNAMES.has(String(result?.hostname || "").toLowerCase())) {
    return { ok: false, error: TURNSTILE_REGISTRATION_ERROR_AR, status: 403 };
  }

  return { ok: true, hostname: result.hostname || null };
}
