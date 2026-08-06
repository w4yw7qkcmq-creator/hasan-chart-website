#!/usr/bin/env node
/**
 * Static browser matrix checks for VIP Recent Recommendations panel.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelPath = join(
  process.cwd(),
  "app/(app)/admin/components/VipRecentRecommendationsPanel.js"
);
const source = readFileSync(panelPath, "utf8");

const checks = [
  ["section title", /آخر التوصيات المنشورة/],
  ["confirmation modal", /تأكيد إرسال الإشعار/],
  ["retry button", /إعادة محاولة القنوات الفاشلة/],
  ["status history", /سجل الحالة/],
  ["disabled reason text", /disabledReason/],
  ["responsive grid", /md:grid-cols-3/],
  ["loading state", /جاري تحميل/],
  ["empty state", /لا توجد توصيات/],
  ["RTL-friendly layout", /flex-wrap/],
  ["light/dark safe tokens", /text-slate-/],
];

let failures = 0;
for (const [name, pattern] of checks) {
  if (!pattern.test(source)) {
    console.error(`FAIL browser-matrix static: missing ${name}`);
    failures += 1;
  }
}

assert.equal(failures, 0, `browser matrix static failures: ${failures}`);
console.log("VIP browser matrix static PASS", { checks: checks.length, failures });
