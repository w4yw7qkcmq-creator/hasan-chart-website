#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const workerRoot = path.join(repoRoot, "worker");

const CALLSITE_RULES = [
  {
    id: "telegram_send_message",
    pattern: /\bsendTelegramMessage\s*\(/,
  },
  {
    id: "telegram_send_photo",
    pattern: /\bsendTelegramPhoto\s*\(/,
  },
  {
    id: "telegram_bot_api",
    pattern: /api\.telegram\.org/,
  },
  {
    id: "publish_structured_economic",
    pattern: /\bpublishStructuredEconomicReleaseResult\s*\(/,
  },
];

const CLASSIFICATIONS = {
  GATEWAY: "NEWS_RELEASE_VIA_GATEWAY",
  DELIVERY_DEPS: "DELIVERY_DEPENDENCY",
  PRE_EVENT: "PRE_EVENT_OR_SCHEDULED_ALERT",
  NON_NEWS: "NON_NEWS_OPERATIONAL",
  BLOCKED: "LEGACY_BLOCKED",
  FAIL: "ECONOMIC_RELEASE_DIRECT_SEND",
};

function classifyCallSite(filePath, ruleId) {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.includes("worker/lib/news-intelligence/publisher-gateway.js")) {
    return CLASSIFICATIONS.GATEWAY;
  }
  if (normalized.includes("worker/lib/news-images/telegram-delivery.js")) {
    return CLASSIFICATIONS.DELIVERY_DEPS;
  }
  if (normalized.includes("worker/news-worker.js")) {
    return CLASSIFICATIONS.PRE_EVENT;
  }
  if (normalized.includes("worker/lib/telegram-news/atomic-publish.js")) {
    return ruleId === "publish_structured_economic" ? CLASSIFICATIONS.GATEWAY : CLASSIFICATIONS.GATEWAY;
  }
  if (normalized.includes("app/api/send-news/route.ts")) {
    return CLASSIFICATIONS.BLOCKED;
  }
  if (normalized.includes("worker/tests/") || normalized.includes("scripts/test-")) {
    return CLASSIFICATIONS.NON_NEWS;
  }
  if (normalized.includes("app/(app)/admin/news/")) {
    return CLASSIFICATIONS.NON_NEWS;
  }

  if (
    normalized.includes("worker/lib/telegram-news/") ||
    normalized.includes("worker/lib/economic-releases/") ||
    normalized.includes("worker/lib/general-rss/") ||
    normalized.includes("worker/lib/news-intelligence/")
  ) {
    return CLASSIFICATIONS.FAIL;
  }

  return CLASSIFICATIONS.NON_NEWS;
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      walkFiles(full, files);
      continue;
    }
    if (/\.(js|cjs|mjs|ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function auditRepository() {
  const scanRoots = [workerRoot, path.join(repoRoot, "app"), path.join(repoRoot, "lib"), path.join(repoRoot, "scripts")];
  const files = [];
  for (const root of scanRoots) {
    walkFiles(root, files);
  }

  const findings = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const rule of CALLSITE_RULES) {
      if (!rule.pattern.test(content)) {
        continue;
      }
      const classification = classifyCallSite(filePath, rule.id);
      findings.push({
        filePath: path.relative(repoRoot, filePath),
        rule: rule.id,
        classification,
      });
    }
  }

  return findings;
}

const findings = auditRepository();
const failures = findings.filter((item) => item.classification === CLASSIFICATIONS.FAIL);

assert.strictEqual(failures.length, 0, JSON.stringify({ failures, findings }, null, 2));

const sendNewsRoute = fs.readFileSync(path.join(repoRoot, "app/api/send-news/route.ts"), "utf8");
assert.ok(!/api\.telegram\.org/.test(sendNewsRoute), "send-news route must not call Telegram Bot API directly");

console.log(
  "news-gateway-bypass.test.cjs: PASS",
  JSON.stringify({
    auditedFindings: findings.length,
    economicDirectSendFailures: failures.length,
  })
);
