const path = require("path");

const SERVICE_NAME = "hasan-chart-vip-status-delivery-worker";
const WORKER_ENTRY = "worker/vip-status-delivery-worker.js";

const {
  isOneShotMode,
  getPersistentWorkerConfig,
  runPersistentVipStatusDeliveryLoop,
} = require("./vip-status-delivery-persistent-loop.js");

function logBoot(event, extra = {}) {
  console.log(
    JSON.stringify({
      event,
      service: SERVICE_NAME,
      workerEntry: WORKER_ENTRY,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      buildCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
      ...extra,
    })
  );
}

function loadEnv() {
  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
    require("dotenv").config();
  } catch (error) {
    logBoot("REQUIRE_DOTENV_SKIPPED", {
      error: error?.message || String(error),
    });
  }
}

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

function createSupabaseClient() {
  const { createClient } = require("@supabase/supabase-js");
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration for VIP status delivery worker.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function validateRuntimeEnv() {
  const missing = [];

  if (!getSupabaseUrl()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function loadQueueModule() {
  return import("../lib/vip-status-delivery-queue.js");
}

async function loadFlagModule() {
  return import("../lib/vip-status-delivery-worker-flag.js");
}

function handleDisabledWorkerStartup({ oneShot, enabled }) {
  const { resolveDisabledWorkerStartup } = require("../lib/vip-status-delivery-startup.js");
  const decision = resolveDisabledWorkerStartup({ oneShot, enabled });

  if (decision.action === "continue") {
    return decision;
  }

  console.log(
    JSON.stringify({
      level: decision.level || "info",
      event: decision.event,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      message: decision.message || null,
    })
  );

  process.exit(decision.exitCode);
  return decision;
}

async function runOneShotCron() {
  const { isVipStatusDeliveryWorkerEnabled } = await loadFlagModule();
  const { runVipStatusDeliveryCron } = await loadQueueModule();

  if (!isVipStatusDeliveryWorkerEnabled()) {
    handleDisabledWorkerStartup({ oneShot: true, enabled: false });
    return;
  }

  logBoot("VIP_STATUS_DELIVERY_CRON_STARTED");
  validateRuntimeEnv();

  const supabase = createSupabaseClient();
  await runVipStatusDeliveryCron(supabase);

  process.exit(0);
}

async function runPersistentWorker() {
  const { isVipStatusDeliveryWorkerEnabled } = await loadFlagModule();
  const { runVipStatusDeliveryBatch } = await loadQueueModule();

  if (!isVipStatusDeliveryWorkerEnabled()) {
    handleDisabledWorkerStartup({ oneShot: false, enabled: false });
    return;
  }

  validateRuntimeEnv();

  const supabase = createSupabaseClient();
  const config = getPersistentWorkerConfig();
  let shutdownRequested = false;

  const handleShutdownSignal = (signal) => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    logBoot("VIP_STATUS_DELIVERY_PERSISTENT_SHUTDOWN_SIGNAL", { signal });
  };

  process.on("SIGTERM", handleShutdownSignal);
  process.on("SIGINT", handleShutdownSignal);

  await runPersistentVipStatusDeliveryLoop({
    config,
    shouldStop: () => shutdownRequested,
    runCycle: () => runVipStatusDeliveryBatch(supabase),
  });

  process.exit(0);
}

function registerFatalHandlers(mode) {
  process.on("uncaughtException", (error) => {
    logBoot(mode === "oneshot" ? "VIP_STATUS_DELIVERY_CRON_FAILED" : "VIP_STATUS_DELIVERY_PERSISTENT_WORKER_FAILED", {
      level: "error",
      error: error?.message || String(error),
      stack: error?.stack || null,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logBoot(mode === "oneshot" ? "VIP_STATUS_DELIVERY_CRON_FAILED" : "VIP_STATUS_DELIVERY_PERSISTENT_WORKER_FAILED", {
      level: "error",
      error: reason?.message || String(reason),
      stack: reason?.stack || null,
    });
    process.exit(1);
  });
}

async function main() {
  loadEnv();
  registerFatalHandlers(isOneShotMode() ? "oneshot" : "persistent");

  if (isOneShotMode()) {
    await runOneShotCron();
    return;
  }

  await runPersistentWorker();
}

main().catch((error) => {
  logBoot("VIP_STATUS_DELIVERY_WORKER_BOOT_FAILED", {
    level: "error",
    error: error?.message || String(error),
  });
  process.exit(1);
});
