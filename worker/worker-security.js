const crypto = require("crypto");

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function getAllowedOrigins() {
  const values = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    "https://www.hasanchartworld.com",
    "https://hasanchartworld.com",
  ];

  const origins = new Set();

  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }

  return [...origins];
}

function secureCompare(provided, expected) {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function getWorkerSharedSecret() {
  return String(process.env.WORKER_API_SECRET || process.env.CRON_SECRET || "").trim();
}

function getProvidedWorkerSecret(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return bearer || String(req.headers["x-worker-secret"] || "").trim();
}

function hasValidWorkerSecret(req) {
  const secret = getWorkerSharedSecret();
  if (!secret) return false;
  return secureCompare(getProvidedWorkerSecret(req), secret);
}

function isAllowedBrowserOrigin(req) {
  const allowed = getAllowedOrigins();
  const origin = normalizeOrigin(req.headers.origin);

  if (origin && allowed.includes(origin)) {
    return true;
  }

  const referer = String(req.headers.referer || "").trim();

  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return false;
}

function verifyWorkerApiAccess(req) {
  if (hasValidWorkerSecret(req)) {
    return { ok: true, mode: "secret" };
  }

  if (isAllowedBrowserOrigin(req)) {
    return { ok: true, mode: "origin" };
  }

  return {
    ok: false,
    status: 403,
    error: "Forbidden worker request.",
  };
}

function createWorkerCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalized = normalizeOrigin(origin);

      if (normalized && allowedOrigins.includes(normalized)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by worker CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-worker-secret",
      "x-cron-secret",
    ],
    maxAge: 600,
  };
}

const analysisRateLimitStore = new Map();
const ANALYSIS_RATE_WINDOW_MS = 60_000;
const ANALYSIS_RATE_MAX = 12;

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return forwarded || req.socket?.remoteAddress || "unknown";
}

function checkInstantAnalysisRateLimit(req) {
  const ip = getRequestIp(req);
  const now = Date.now();
  const entry = analysisRateLimitStore.get(ip) || { count: 0, resetAt: now + ANALYSIS_RATE_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + ANALYSIS_RATE_WINDOW_MS;
  }

  entry.count += 1;
  analysisRateLimitStore.set(ip, entry);

  return entry.count <= ANALYSIS_RATE_MAX;
}

function workerAccessDeniedMiddleware(req, res, next) {
  const auth = verifyWorkerApiAccess(req);

  if (!auth.ok) {
    return res.status(auth.status).json({
      success: false,
      error: auth.error,
    });
  }

  return next();
}

function instantAnalysisRateLimitMiddleware(req, res, next) {
  if (!checkInstantAnalysisRateLimit(req)) {
    return res.status(429).json({
      success: false,
      error: "Too many analysis requests. Try again later.",
    });
  }

  return next();
}

module.exports = {
  createWorkerCorsOptions,
  verifyWorkerApiAccess,
  workerAccessDeniedMiddleware,
  instantAnalysisRateLimitMiddleware,
  getAllowedOrigins,
};
