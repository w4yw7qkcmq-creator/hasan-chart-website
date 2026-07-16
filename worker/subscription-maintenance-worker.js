const http = require("http");
const crypto = require("crypto");
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
  require("dotenv").config();
} catch {
  // dotenv optional when env vars are injected by the platform.
}

const { createClient } = require("@supabase/supabase-js");

const SERVICE_NAME = "hasan-chart-subscription-maintenance-worker";
const WORKER_ENTRY = "worker/subscription-maintenance-worker.js";
const PORT = Number(process.env.PORT || 3099);

let maintenanceInFlight = false;
let sharedModulePromise = null;

function loadSharedModule() {
  if (!sharedModulePromise) {
    sharedModulePromise = import("../lib/subscription-expiry-shared.js");
  }

  return sharedModulePromise;
}

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

function createSupabaseClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration for subscription maintenance worker.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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

function getCronSecretFromRequest(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerSecret = String(req.headers["x-cron-secret"] || "").trim();
  const querySecret = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    .searchParams.get("secret")
    ?.trim();

  return bearer || headerSecret || querySecret || "";
}

function verifyCronSecret(req) {
  const secret =
    process.env.CRON_SECRET?.trim() || process.env.ADMIN_CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Cron secret is not configured on the worker.",
    };
  }

  const provided = getCronSecretFromRequest(req);

  if (!secureCompare(provided, secret)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized cron request.",
    };
  }

  return { ok: true };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return {};
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function parseDryRun(req, body = {}) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  const queryValue = url.searchParams.get("dryRun");
  const headerValue = req.headers["x-dry-run"];
  const bodyValue = body?.dryRun;

  const raw = queryValue ?? headerValue ?? bodyValue ?? "false";
  const normalized = String(raw).trim().toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isWorkerFeatureEnabled() {
  const value = String(process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

async function handleHealth(_req, res) {
  sendJson(res, 200, {
    success: true,
    status: "online",
    service: SERVICE_NAME,
    workerEntry: WORKER_ENTRY,
    workerEnabled: isWorkerFeatureEnabled(),
    timestamp: new Date().toISOString(),
  });
}

async function handleRun(req, res) {
  const authCheck = verifyCronSecret(req);

  if (!authCheck.ok) {
    sendJson(res, authCheck.status, {
      success: false,
      error: authCheck.error,
    });
    return;
  }

  if (!isWorkerFeatureEnabled()) {
    sendJson(res, 503, {
      success: false,
      skipped: true,
      reason: "SUBSCRIPTION_MAINTENANCE_WORKER_DISABLED",
      error:
        "Subscription maintenance worker is disabled. Set SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED=true on this service.",
    });
    return;
  }

  if (maintenanceInFlight) {
    sendJson(res, 409, {
      success: false,
      error: "Subscription maintenance is already running.",
    });
    return;
  }

  maintenanceInFlight = true;
  const startedAt = Date.now();

  try {
    const body = await readJsonBody(req);
    const dryRun = parseDryRun(req, body);
    const shared = await loadSharedModule();
    const supabase = createSupabaseClient();
    const summary = await shared.runSubscriptionMaintenance(supabase, { dryRun });

    console.log("subscription-maintenance:run-complete", {
      dryRun,
      durationMs: summary.durationMs,
      checked: summary.checked,
      expired: summary.expired,
      expiringSoon: summary.expiringSoon,
      emailsSent: summary.emailsSent,
      siteNotificationsCreated: summary.siteNotificationsCreated,
      failed: summary.failed,
    });

    sendJson(res, 200, shared.buildMaintenanceResponse(summary));
  } catch (error) {
    console.error("subscription-maintenance:run-error", {
      error: error?.message || String(error),
      durationMs: Date.now() - startedAt,
    });

    sendJson(res, 500, {
      success: false,
      error: error?.message || "Subscription maintenance failed.",
      durationMs: Date.now() - startedAt,
    });
  } finally {
    maintenanceInFlight = false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/health") {
      await handleHealth(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && pathname === "/run") {
      await handleRun(req, res);
      return;
    }

    sendJson(res, 404, {
      success: false,
      error: "Not found.",
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error?.message || "Server error.",
    });
  }
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: "subscription-maintenance:boot",
      service: SERVICE_NAME,
      workerEntry: WORKER_ENTRY,
      port: PORT,
      workerEnabledEnv: process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "false",
    })
  );
});
