const SERVICE_NAME = "hasan-chart-subscription-maintenance-worker";
const WORKER_ENTRY = "worker/subscription-maintenance-worker.js";
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3099);

let maintenanceInFlight = false;
let runSubscriptionMaintenance;
let buildMaintenanceResponse;

function logBoot(event, extra = {}) {
  console.log(
    JSON.stringify({
      event,
      service: SERVICE_NAME,
      workerEntry: WORKER_ENTRY,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...extra,
    })
  );
}

process.on("uncaughtException", (error) => {
  logBoot("UNCAUGHT_EXCEPTION", {
    error: error?.message || String(error),
    stack: error?.stack || null,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logBoot("UNHANDLED_REJECTION", {
    error: reason?.message || String(reason),
    stack: reason?.stack || null,
  });
  process.exit(1);
});

logBoot("BEFORE_REQUIRE", { modules: ["http", "path"] });
const http = require("http");
const path = require("path");
const {
  verifyWorkerRouteAccess,
  isLegacyFallbackEnabled,
} = require("./lib/machine-auth");
logBoot("AFTER_REQUIRE", { modules: ["http", "path", "./lib/machine-auth"] });

function loadRuntimeModules() {
  logBoot("BEFORE_REQUIRE", { module: "dotenv" });

  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
    require("dotenv").config();
    logBoot("AFTER_REQUIRE", { module: "dotenv" });
  } catch (error) {
    logBoot("REQUIRE_DOTENV_SKIPPED", {
      error: error?.message || String(error),
    });
  }

  logBoot("BEFORE_REQUIRE", { module: "./subscription-expiry-shared.js" });
  ({ runSubscriptionMaintenance, buildMaintenanceResponse } = require("./subscription-expiry-shared.js"));
  logBoot("AFTER_REQUIRE", { module: "./subscription-expiry-shared.js" });
}

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

function createSupabaseClient() {
  logBoot("BEFORE_REQUIRE", { module: "@supabase/supabase-js" });
  const { createClient } = require("@supabase/supabase-js");
  logBoot("AFTER_REQUIRE", { module: "@supabase/supabase-js" });
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

function resolveMaintenanceServiceAccountId() {
  return String(
    process.env.IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID ||
      "subscription-maintenance-worker"
  ).trim();
}

function resolveMaintenanceRequiredPermission() {
  return String(process.env.IAM_SUBSCRIPTION_MAINTENANCE_PERMISSION || "subscriptions.manage").trim();
}

async function verifyMaintenanceAccess(req) {
  return verifyWorkerRouteAccess(req, {
    allowedServiceAccountIds: [resolveMaintenanceServiceAccountId()],
    requiredPermission: resolveMaintenanceRequiredPermission(),
  });
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

function isOneShotMode() {
  const value = String(process.env.SUBSCRIPTION_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

async function handleHealth(_req, res) {
  logBoot("ROUTE_HEALTH_ENTER");
  sendJson(res, 200, {
    success: true,
    status: "online",
    service: SERVICE_NAME,
    workerEntry: WORKER_ENTRY,
    workerEnabled: isWorkerFeatureEnabled(),
    legacyFallbackEnabled: isLegacyFallbackEnabled(),
    machineAuthServiceAccount: resolveMaintenanceServiceAccountId(),
    timestamp: new Date().toISOString(),
  });
}

async function handleRun(req, res) {
  logBoot("ROUTE_RUN_ENTER", {
    method: req.method,
    url: req.url,
  });
  const authCheck = await verifyMaintenanceAccess(req);

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
    const supabase = createSupabaseClient();
    const summary = await runSubscriptionMaintenance(supabase, { dryRun });

    console.log(
      JSON.stringify({
        event: "subscription-maintenance:run-complete",
        dryRun,
        durationMs: summary.durationMs,
        checked: summary.checked,
        expired: summary.expired,
        expiringSoon: summary.expiringSoon,
        emailsSent: summary.emailsSent,
        siteNotificationsCreated: summary.siteNotificationsCreated,
        failed: summary.failed,
      })
    );

    sendJson(res, 200, buildMaintenanceResponse(summary));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "subscription-maintenance:run-error",
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      })
    );

    sendJson(res, 500, {
      success: false,
      error: error?.message || "Subscription maintenance failed.",
      durationMs: Date.now() - startedAt,
    });
  } finally {
    maintenanceInFlight = false;
  }
}

function createHttpServer() {
  logBoot("BEFORE_CREATE_SERVER");

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

  logBoot("AFTER_CREATE_SERVER");
  return server;
}

async function runOneShotCron() {
  logBoot("SUBSCRIPTION_MAINTENANCE_CRON_STARTED", {
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV || "development",
    workerEnabledEnv: process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "false",
  });

  try {
    loadRuntimeModules();

    if (!isWorkerFeatureEnabled()) {
      logBoot("SUBSCRIPTION_MAINTENANCE_CRON_FINISHED", {
        success: true,
        skipped: true,
        reason: "SUBSCRIPTION_MAINTENANCE_WORKER_DISABLED",
      });
      process.exit(0);
      return;
    }

    const supabase = createSupabaseClient();
    const summary = await runSubscriptionMaintenance(supabase, { dryRun: false });
    const response = buildMaintenanceResponse(summary);

    logBoot("SUBSCRIPTION_MAINTENANCE_CRON_FINISHED", response);
    process.exit(0);
  } catch (error) {
    logBoot("SUBSCRIPTION_MAINTENANCE_CRON_FAILED", {
      error: error?.message || String(error),
      stack: error?.stack || null,
    });
    process.exit(1);
  }
}

function startServer() {
  logBoot("BOOT_START", {
    port: PORT,
    host: HOST,
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV || "development",
    workerEnabledEnv: process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "false",
    runtimeMode: "always-on-http-server",
  });

  loadRuntimeModules();

  const server = createHttpServer();

  logBoot("SERVER_CREATED");

  server.on("error", (error) => {
    logBoot("SERVER_LISTEN_ERROR", {
      port: PORT,
      host: HOST,
      error: error?.message || String(error),
      code: error?.code || null,
    });
    process.exit(1);
  });

  logBoot("BEFORE_LISTEN", { port: PORT, host: HOST });

  server.listen(PORT, HOST, () => {
    logBoot("subscription-maintenance:boot", {
      port: PORT,
      host: HOST,
      workerEnabledEnv: process.env.SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED || "false",
    });
    logBoot("LISTENING_ON_PORT", {
      port: PORT,
      host: HOST,
      message: `Worker listening on port ${PORT}`,
    });
    logBoot("HEALTH_READY", {
      healthPath: "/health",
      runPath: "/run",
    });
  });

  return server;
}

if (isOneShotMode()) {
  runOneShotCron();
} else {
  startServer();
}
