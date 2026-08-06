#!/usr/bin/env node
/**
 * Static browser matrix checks for VIP Active Recommendations panel.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelPath = join(
  process.cwd(),
  "app/(app)/admin/components/VipRecentRecommendationsPanel.js"
);
const adminPagePath = join(process.cwd(), "app/(app)/admin/page.js");
const panelSource = readFileSync(panelPath, "utf8");
const adminSource = readFileSync(adminPagePath, "utf8");

const checks = [
  ["active section title", /التوصيات النشطة/],
  ["completed history section", /سجل التوصيات المنتهية/],
  ["target 1 badge", /تم تحقيق الهدف الأول/],
  ["refresh event listener", /VIP_RECOMMENDATIONS_REFRESH_EVENT/],
  ["completed fetch route", /\/api\/admin\/vip-recommendations\/completed/],
  ["confirmation modal", /تأكيد إرسال الإشعار/],
  ["disabled reason text", /disabledReason/],
  ["collapsible history", /aria-expanded=\{historyOpen\}/],
  ["responsive grid", /md:grid-cols-3/],
  ["loading state", /جاري تحميل/],
  ["empty active state", /لا توجد توصيات نشطة/],
  ["RTL-friendly layout", /flex-wrap/],
  ["light/dark safe tokens", /text-slate-/],
  ["publish refresh dispatch", /VIP_RECOMMENDATIONS_REFRESH_EVENT/],
];

let failures = 0;
for (const [name, pattern] of checks) {
  const source = name === "publish refresh dispatch" ? adminSource : panelSource;
  if (!pattern.test(source)) {
    console.error(`FAIL browser-matrix static: missing ${name}`);
    failures += 1;
  }
}

assert.equal(failures, 0, `browser matrix static failures: ${failures}`);
console.log("VIP browser matrix static PASS", { checks: checks.length, failures });
