#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "app/(app)/sitemap.js",
  "app/robots.js",
  "app/api/health/route.js",
  "app/error.js",
  "app/global-error.js",
  "app/not-found.js",
  ".env.example",
  "DEPLOYMENT.md",
  "PRODUCTION_CHECKLIST.md",
  "LAUNCH_CHECKLIST.md",
  "ROLLBACK_PLAN.md",
  "worker/index.js",
];

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "CRON_SECRET",
  "ACCOUNT_DATA_ENCRYPTION_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
];

const RECOMMENDED_ENV_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_WEBHOOK_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_RAILWAY_AI_WORKER_URL",
  "EMAIL_FROM",
  "ADMIN_EMAIL",
];

const PUBLIC_SCAN_DIRS = ["public"];
const PUBLIC_SCAN_FILES = ["README.md", "DEPLOYMENT.md"];

const SOURCE_SCAN_DIRS = ["app", "lib"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "security-reports",
]);

const SECRET_PATTERNS = [
  {
    name: "OpenAI/Stripe-style secret key",
    regex: /sk-[A-Za-z0-9]{20,}/g,
  },
  {
    name: "JWT token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: "Resend live API key",
    regex: /re_[A-Za-z0-9]{20,}/g,
  },
  {
    name: "Resend webhook secret",
    regex: /whsec_[A-Za-z0-9]{20,}/g,
  },
  {
    name: "Hardcoded service role assignment",
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'`][^"'`\s]{20,}["'`]/g,
  },
];

const PLACEHOLDER_MARKERS = [
  "your_",
  "YOUR_",
  "example",
  "placeholder",
  "changeme",
  "xxx",
];

const SENSITIVE_CONSOLE_REGEX =
  /console\.(log|info|debug)\([^;\n]*(password|api[_-]?key|secret|service[_-]?role|authorization|bearer\s)/i;

const CONSOLE_SCAN_IGNORE = new Set([
  "scripts/preflight-check.js",
  "scripts/security-audit.js",
  "lib/log-redaction.js",
  "lib/dev-log.js",
  "lib/structured-logger.js",
]);

const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function isStrictEnvMode() {
  return (
    process.env.PREFLIGHT_STRICT === "1" ||
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.NODE_ENV === "production"
  );
}

function reportEnvGap(message, { strictOnly = false } = {}) {
  if (strictOnly && !isStrictEnvMode()) {
    addWarning(`${message} (strict mode not enabled — set PREFLIGHT_STRICT=1 for deploy gate)`);
    return;
  }

  if (isStrictEnvMode()) {
    addError(message);
  } else {
    addWarning(message);
  }
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function loadEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return true;
}

function isPlaceholderSecret(value) {
  const normalized = String(value || "").toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

function isEnvVarSet(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) return false;
  if (isPlaceholderSecret(value)) return false;
  return true;
}

function validateSiteUrl() {
  const siteUrl = String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ""
  ).trim();

  if (!siteUrl) {
    reportEnvGap("SITE_URL: NEXT_PUBLIC_SITE_URL / SITE_URL is not configured.");
    return;
  }

  try {
    const parsed = new URL(siteUrl);

    if (parsed.protocol !== "https:") {
      addError(`SITE_URL: must use https:// (current protocol: ${parsed.protocol})`);
      return;
    }

    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      addError("SITE_URL: hostname looks invalid.");
      return;
    }

    if (parsed.hostname === "localhost") {
      addWarning("SITE_URL: points to localhost — expected production canonical URL.");
    }
  } catch {
    addError("SITE_URL: NEXT_PUBLIC_SITE_URL / SITE_URL is not a valid URL.");
  }
}

function checkRequiredFiles() {
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      addError(`Missing required file: ${file}`);
    }
  }
}

function checkEnvironmentVariables() {
  const loadedLocal = loadEnvFile(".env.local");
  const loadedEnv = loadEnvFile(".env");
  const hasEnvSource = loadedLocal || loadedEnv || REQUIRED_ENV_VARS.some(isEnvVarSet);

  if (!hasEnvSource) {
    addWarning(
      "Environment: no .env.local/.env and no required variables in process.env — skipping strict env validation."
    );
    return;
  }

  const missingRequired = REQUIRED_ENV_VARS.filter((name) => !isEnvVarSet(name));
  const missingRecommended = RECOMMENDED_ENV_VARS.filter((name) => !isEnvVarSet(name));

  if (missingRequired.length) {
    reportEnvGap(`Missing required environment variables: ${missingRequired.join(", ")}`);
  }

  if (missingRecommended.length) {
    addWarning(`Missing recommended environment variables: ${missingRecommended.join(", ")}`);
  }

  validateSiteUrl();
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function looksLikeRealSecret(match) {
  return !isPlaceholderSecret(match);
}

function scanForHardcodedSecrets(filePath) {
  const relative = rel(filePath);
  if (relative === ".env.example") return;

  const content = fs.readFileSync(filePath, "utf8");

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (!matches) continue;

    for (const match of matches) {
      if (!looksLikeRealSecret(match)) continue;
      addError(`Possible secret in ${relative}: ${pattern.name}`);
      break;
    }
  }
}

function scanSecretsInPublicFiles() {
  const files = [];

  for (const dir of PUBLIC_SCAN_DIRS) {
    files.push(...walkFiles(path.join(ROOT, dir)));
  }

  for (const file of PUBLIC_SCAN_FILES) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) files.push(fullPath);
  }

  for (const file of files) {
    scanForHardcodedSecrets(file);
  }
}

function scanSensitiveConsoleLogs() {
  for (const dir of SOURCE_SCAN_DIRS) {
    const files = walkFiles(path.join(ROOT, dir)).filter((file) =>
      SOURCE_EXTENSIONS.has(path.extname(file))
    );

    for (const file of files) {
      const relative = rel(file);
      if (CONSOLE_SCAN_IGNORE.has(relative)) continue;

      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!SENSITIVE_CONSOLE_REGEX.test(line)) continue;
        if (line.includes("NODE_ENV") || line.includes("devLog")) continue;

        addWarning(
          `Sensitive console log in ${relative}:${index + 1} — use devLog or structured logger with redaction.`
        );
      }
    }
  }
}

function printReport() {
  console.log("\nHasaN CharT World — Preflight Check\n");

  if (!errors.length && !warnings.length) {
    console.log("All preflight checks passed.\n");
    return;
  }

  if (errors.length) {
    console.log(`Errors (${errors.length}):`);
    for (const item of errors) {
      console.log(`  ✗ ${item}`);
    }
    console.log("");
  }

  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const item of warnings) {
      console.log(`  ! ${item}`);
    }
    console.log("");
  }

  if (!errors.length) {
    console.log("Preflight passed with warnings.\n");
  }
}

function main() {
  checkRequiredFiles();
  checkEnvironmentVariables();
  scanSecretsInPublicFiles();
  scanSensitiveConsoleLogs();
  printReport();

  if (errors.length) {
    process.exit(1);
  }
}

main();
