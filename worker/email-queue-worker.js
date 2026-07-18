const path = require("path");

const SERVICE_NAME = "hasan-chart-email-queue-worker";
const WORKER_ENTRY = "worker/email-queue-worker.js";

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
  logBoot("EMAIL_QUEUE_CRON_FAILED", {
    level: "error",
    error: error?.message || String(error),
    stack: error?.stack || null,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logBoot("EMAIL_QUEUE_CRON_FAILED", {
    level: "error",
    error: reason?.message || String(reason),
    stack: reason?.stack || null,
  });
  process.exit(1);
});

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
    throw new Error("Missing Supabase configuration for email queue worker.");
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

  if (!process.env.RESEND_API_KEY?.trim()) {
    missing.push("RESEND_API_KEY");
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function isOneShotMode() {
  const value = String(process.env.EMAIL_QUEUE_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

async function runOneShotCron() {
  loadEnv();

  const {
    isEmailQueueWorkerEnabled,
    logEmailQueueEvent,
    runEmailQueueCron,
  } = require("./email-outbox-processor.js");

  try {
    if (!isEmailQueueWorkerEnabled()) {
      logEmailQueueEvent("EMAIL_QUEUE_WORKER_SKIPPED");
      process.exit(0);
      return;
    }

    logEmailQueueEvent("EMAIL_QUEUE_CRON_STARTED", {
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV || "development",
      workerEnabledEnv: process.env.EMAIL_QUEUE_WORKER_ENABLED || "false",
    });

    validateRuntimeEnv();

    const supabase = createSupabaseClient();
    await runEmailQueueCron(supabase, { skipCronStartLog: true });

    process.exit(0);
  } catch (error) {
    logEmailQueueEvent("EMAIL_QUEUE_CRON_FAILED", {
      level: "error",
      error: error?.message || String(error),
    });
    process.exit(1);
  }
}

if (!isOneShotMode()) {
  logBoot("EMAIL_QUEUE_WORKER_ONESHOT_REQUIRED", {
    level: "error",
    error:
      "Email queue worker must run in one-shot mode. Set EMAIL_QUEUE_WORKER_ONESHOT=true.",
  });
  process.exit(1);
} else {
  runOneShotCron();
}
