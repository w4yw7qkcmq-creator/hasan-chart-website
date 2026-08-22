const crypto = require("crypto");
const {
  verifyMachineIdentity,
  isWorkerMachineAuthEnabled,
  isLegacyFallbackEnabled,
  getMachineHeaders,
  hasHumanSessionCookie,
  hasOriginOrRefererSignal,
  recordAuthMetric,
  recordDeniedMetric,
  getWorkerAuthMetrics,
  resetWorkerAuthMetrics,
} = require("./lib/machine-auth");

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

  return bearer || String(req.headers["x-worker-secret"] || req.headers["x-cron-secret"] || "").trim();
}

function hasLegacySecretAttempt(req) {
  return Boolean(getProvidedWorkerSecret(req));
}

function hasValidWorkerSecret(req) {
  const secret = getWorkerSharedSecret();
  if (!secret) return false;
  return secureCompare(getProvidedWorkerSecret(req), secret);
}

async function verifyWorkerApiAccess(req) {
  const machineHeaders = getMachineHeaders(req);
  const originSignal = hasOriginOrRefererSignal(req);

  if (hasHumanSessionCookie(req) && !machineHeaders.present && !hasLegacySecretAttempt(req)) {
    recordDeniedMetric("human_session");
    return {
      ok: false,
      status: 403,
      error: "Human sessions cannot access worker machine routes.",
    };
  }

  if (isWorkerMachineAuthEnabled()) {
    const machine = await verifyMachineIdentity(req);
    if (machine.ok) {
      recordAuthMetric("machine");
      return {
        ok: true,
        mode: "machine",
        serviceAccountId: machine.serviceAccountId,
      };
    }

    if (machine.hardFail) {
      recordDeniedMetric("machine");
      return {
        ok: false,
        status: machine.status || 401,
        error: machine.error || "Unauthorized machine request.",
      };
    }
  }

  if (isLegacyFallbackEnabled() && hasValidWorkerSecret(req)) {
    recordAuthMetric("legacy");
    return { ok: true, mode: "legacy" };
  }

  if (hasLegacySecretAttempt(req)) {
    recordDeniedMetric("legacy");
    return {
      ok: false,
      status: 401,
      error: "Unauthorized worker request.",
    };
  }

  if (originSignal) {
    recordDeniedMetric("origin");
    return {
      ok: false,
      status: 403,
      error: "Forbidden worker request.",
    };
  }

  recordDeniedMetric("denied");
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
      "x-service-account-id",
      "x-service-account-secret",
      "x-iam-service-id",
      "x-iam-service-secret",
    ],
    maxAge: 600,
  };
}

async function workerAccessDeniedMiddleware(req, res, next) {
  try {
    const auth = await verifyWorkerApiAccess(req);

    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.error,
      });
    }

    req.workerAuth = auth;
    return next();
  } catch {
    return res.status(500).json({
      success: false,
      error: "Worker authentication failed.",
    });
  }
}

module.exports = {
  createWorkerCorsOptions,
  verifyWorkerApiAccess,
  workerAccessDeniedMiddleware,
  getAllowedOrigins,
  getWorkerAuthMetrics,
  resetWorkerAuthMetrics,
};
