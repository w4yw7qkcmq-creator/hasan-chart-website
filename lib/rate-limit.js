const requests = new Map();

export const RATE_LIMIT_ERROR =
  "تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  prefix = "default",
} = {}) {
  return function check(identifier) {
    const now = Date.now();
    const key = `${prefix}:${identifier}`;

    const current = requests.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    if (now > current.resetTime) {
      current.count = 0;
      current.resetTime = now + windowMs;
    }

    current.count += 1;
    requests.set(key, current);

    return {
      success: current.count <= max,
      remaining: Math.max(0, max - current.count),
      resetTime: current.resetTime,
    };
  };
}

export const loginIpLimiter = rateLimit({
  prefix: "login-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
});

export const registerIpLimiter = rateLimit({
  prefix: "register-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
});

export const refreshIpLimiter = rateLimit({
  prefix: "refresh-ip",
  windowMs: TEN_MINUTES_MS,
  max: 30,
});

export const analysisRequestLimiter = rateLimit({
  prefix: "analysis-request",
  windowMs: ONE_HOUR_MS,
  max: 5,
});

export const alertLimiter = rateLimit({
  prefix: "alerts",
  windowMs: ONE_HOUR_MS,
  max: 20,
});

export const subscriptionRequestLimiter = rateLimit({
  prefix: "subscription-request",
  windowMs: ONE_HOUR_MS,
  max: 10,
});

export const accountManagementLimiter = rateLimit({
  prefix: "account-management",
  windowMs: ONE_HOUR_MS,
  max: 5,
});
