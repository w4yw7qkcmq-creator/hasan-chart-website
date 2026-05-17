const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 12;

const ipStore = globalThis.__turnstileRateLimitStore || new Map();
globalThis.__turnstileRateLimitStore = ipStore;

const cleanOldIps = () => {
  const now = Date.now();

  for (const [ip, data] of ipStore.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
      ipStore.delete(ip);
    }
  }
};

const getClientIp = (req) => {
  const forwarded = req.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.headers.get("x-real-ip") || "unknown";
};

const isAllowedHostname = (hostname) => {
  const allowed = [
    "hasanchartworld.com",
    "www.hasanchartworld.com",
    "localhost",
  ];

  return allowed.includes(String(hostname || "").toLowerCase());
};

export async function POST(req) {
  try {
    cleanOldIps();

    const ip = getClientIp(req);
    const now = Date.now();

    const current = ipStore.get(ip);

    if (!current) {
      ipStore.set(ip, {
        count: 1,
        firstRequest: now,
      });
    } else {
      if (now - current.firstRequest > RATE_LIMIT_WINDOW_MS) {
        ipStore.set(ip, {
          count: 1,
          firstRequest: now,
        });
      } else {
        current.count += 1;

        if (current.count > MAX_REQUESTS_PER_IP) {
          return Response.json(
            {
              success: false,
              error: "عدد محاولات التحقق كبير جدًا. حاول بعد عدة دقائق.",
            },
            { status: 429 }
          );
        }
      }
    }

    const body = await req.json().catch(() => null);

    const token = body?.token;

    if (!token || typeof token !== "string") {
      return Response.json(
        {
          success: false,
          error: "رمز التحقق الأمني غير صالح.",
        },
        { status: 400 }
      );
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;

    if (!secret) {
      console.error("Missing TURNSTILE_SECRET_KEY");

      return Response.json(
        {
          success: false,
          error: "خطأ في إعدادات الحماية الأمنية.",
        },
        { status: 500 }
      );
    }

    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);
    formData.append("remoteip", ip);

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!verifyResponse.ok) {
      return Response.json(
        {
          success: false,
          error: "تعذر الوصول لخدمة التحقق الأمني.",
        },
        { status: 502 }
      );
    }

    const result = await verifyResponse.json();

    if (!result?.success) {
      console.error("Turnstile verify failed:", result);

      return Response.json(
        {
          success: false,
          error: "فشل التحقق الأمني. حاول مرة ثانية.",
          codes: result?.["error-codes"] || [],
        },
        { status: 403 }
      );
    }

    if (!isAllowedHostname(result?.hostname)) {
      console.error("Blocked hostname:", result?.hostname);

      return Response.json(
        {
          success: false,
          error: "اسم النطاق غير مصرح به.",
        },
        { status: 403 }
      );
    }

    return Response.json({
      success: true,
      hostname: result?.hostname || null,
      challenge_ts: result?.challenge_ts || null,
    });
  } catch (error) {
    console.error("Turnstile route error:", error);

    return Response.json(
      {
        success: false,
        error: "حدث خطأ أمني غير متوقع.",
      },
      { status: 500 }
    );
  }
}