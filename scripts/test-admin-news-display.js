#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_COPY_POLISH_LABEL,
  containsArabicIndicDigits,
  filterProductionIncidents,
  filterProductionSources,
  formatGregorianDateTime,
  formatLatencyMs,
  formatRelativeAge,
  isSyntheticIncident,
  isSyntheticSource,
  NEWS_SYSTEM_REFRESH_MS,
} from "../app/(app)/admin/news/news-system-display.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const panelPath = path.join(repoRoot, "app/(app)/admin/news/NewsSystemStatusPanel.js");
const hookPath = path.join(repoRoot, "app/(app)/admin/news/useNewsSystemStatus.js");
const panelSource = fs.readFileSync(panelPath, "utf8");
const hookSource = fs.readFileSync(hookPath, "utf8");

assert.equal(formatGregorianDateTime(null), "—");
assert.equal(formatGregorianDateTime("invalid"), "—");

const formatted = formatGregorianDateTime("2026-08-09T04:35:03.000Z");
assert.notEqual(formatted, "—");
assert.ok(formatted.includes("\n") || formatted.includes(" - "));
assert.doesNotMatch(formatted, /Invalid Date/);
assert.match(formatted.replace(/\s/g, ""), /[0-9]/);
assert.equal(containsArabicIndicDigits(formatted), false);

const compact = formatGregorianDateTime("2026-08-09T04:35:03.000Z", { compact: true });
assert.ok(compact.includes(" - "));
assert.equal(containsArabicIndicDigits(compact), false);
assert.match(compact, /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/);

assert.equal(AI_COPY_POLISH_LABEL, "تحسين الصياغة بالـ AI");
assert.equal(formatLatencyMs(null), "—");
assert.equal(formatLatencyMs(184), "184 ms");

assert.equal(formatRelativeAge(Date.now() - 12_000, Date.now()), "منذ 12 ثانية");
assert.equal(formatRelativeAge(Date.now() - 2_000, Date.now()), "الآن");

assert.equal(isSyntheticSource({ sourceId: "CANARY_SYNTHETIC_SOURCE", sourceType: "canary" }), true);
assert.equal(isSyntheticSource({ sourceId: "CoinDesk", sourceType: "rss" }), false);
assert.equal(
  filterProductionSources([
    { sourceId: "CoinDesk", sourceType: "rss" },
    { sourceId: "CANARY_SYNTHETIC_SOURCE", sourceType: "canary" },
  ]).length,
  1
);

assert.equal(isSyntheticIncident({ incidentId: "CANARY-INC-123", severity: "HIGH" }), true);
assert.equal(isSyntheticIncident({ incidentId: "INC-123", affectedSource: "CoinDesk" }), false);
assert.equal(
  filterProductionIncidents([
    { incidentId: "CANARY-INC-123" },
    { incidentId: "INC-PROD-1", affectedSource: "CNBC" },
  ]).length,
  1
);

assert.equal(NEWS_SYSTEM_REFRESH_MS, 30_000);

assert.doesNotMatch(panelSource, />[\s]*تحديث[\s]*</);
assert.doesNotMatch(panelSource, /admin-news-system__refresh"/);
assert.match(panelSource, /useNewsSystemStatus/);
assert.match(panelSource, /formatGregorianDateTime/);
assert.match(panelSource, /filterProductionSources/);
assert.match(panelSource, /filterProductionIncidents/);
assert.match(panelSource, /AI_COPY_POLISH_LABEL/);
assert.match(panelSource, /غير مفعّل/);
assert.doesNotMatch(panelSource, />\s*AI\s*</);
assert.match(panelSource, /phase2\.phase2Ai/);
assert.match(panelSource, /الحوادث المفتوحة/);
assert.match(panelSource, /التكرارات المحظورة/);
assert.match(panelSource, /متوسط زمن المعالجة/);

assert.match(hookSource, /setInterval/);
assert.match(hookSource, /clearInterval/);
assert.match(hookSource, /AbortController/);
assert.match(hookSource, /visibilitychange/);
assert.match(hookSource, /inFlightRef/);
assert.match(hookSource, /silent:\s*true/);
assert.match(hookSource, /setRefreshWarning|refreshWarning/);
assert.match(hookSource, /hasDataRef/);
assert.doesNotMatch(hookSource, /router\.refresh/);
assert.doesNotMatch(hookSource, /location\.reload/);

console.log("test-admin-news-display.js: PASS");
