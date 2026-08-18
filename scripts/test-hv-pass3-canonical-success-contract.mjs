#!/usr/bin/env node
/**
 * Contract tests — Pass3 canonical success helper (no Pass3 run, no .artifacts dependency).
 */
import assert from "node:assert/strict";
import { isPass3Successful } from "./hv-pass3-canonical-success.mjs";

function basePassReport(overrides = {}) {
  return {
    verdict: "HUMAN VERIFICATION + PARTNER ANTI-ABUSE FULL STAGING PASS — READY FOR PRODUCTION APPROVAL",
    errors: [],
    regression: {
      r6_staging: { pass: true },
      r7_staging: { pass: true },
      r8_staging: { pass: true, passCount: 89, failCount: 0 },
      r9_staging: { pass: true, passCount: 131, failCount: 0 },
    },
    fraudReviewApi: { admin: { status: 200 } },
    browser: { pass: true },
    build: { pass: true },
    hmacSecret: { localConfigured: true, stableAcrossProcess: true },
    financialReconciliation: { reconciliationExact: true },
    productionReadOnlyAudit: { completed: true, pass: true, productionWrites: 0 },
    unexpected429: 0,
    unexpected5xx: 0,
    manifest: {
      counts: { total: 133 },
      scenarios: [
        ...Array.from({ length: 12 }, (_, i) => ({ id: `AL-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
        ...Array.from({ length: 10 }, (_, i) => ({ id: `DI-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
        { id: "RC-01", result: "PASS" },
        { id: "CL-01", result: "PASS" },
      ],
    },
    ...overrides,
  };
}

/** Minimal fixture mirroring authoritative green Pass3 hv-pass3-1787060979176 gate shape. */
function buildGreenPass3ReportFixture() {
  return basePassReport({
    runId: "hv-pass3-1787060979176",
    productionReadOnlyAudit: {
      completed: true,
      pass: true,
      readOnly: true,
      productionWrites: 0,
      connectionMode: "management_api",
    },
  });
}

const cases = [];

cases.push(["A_exit0_structured_pass", () => {
  const r = isPass3Successful(basePassReport(), 0);
  assert.equal(r.ok, true);
}]);

cases.push(["B_exit1_descriptive_verdict", () => {
  const r = isPass3Successful(basePassReport(), 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "process_exit_nonzero");
}]);

cases.push(["C_reconciliation_not_exact", () => {
  const r = isPass3Successful(
    basePassReport({
      financialReconciliation: { reconciliationExact: false },
      manifest: {
        counts: { total: 133 },
        scenarios: [
          ...Array.from({ length: 12 }, (_, i) => ({ id: `AL-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
          ...Array.from({ length: 10 }, (_, i) => ({ id: `DI-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
          { id: "RC-01", result: "FAIL" },
          { id: "CL-01", result: "PASS" },
        ],
      },
    }),
    0
  );
  assert.equal(r.ok, false);
  assert.ok(r.gates.failed.includes("reconciliation_exact"));
}]);

cases.push(["D_cl01_residue_fail", () => {
  const r = isPass3Successful(
    basePassReport({
      manifest: {
        counts: { total: 133 },
        scenarios: [
          ...Array.from({ length: 12 }, (_, i) => ({ id: `AL-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
          ...Array.from({ length: 10 }, (_, i) => ({ id: `DI-${String(i + 1).padStart(2, "0")}`, result: "PASS" })),
          { id: "RC-01", result: "PASS" },
          { id: "CL-01", result: "FAIL" },
        ],
      },
    }),
    0
  );
  assert.equal(r.ok, false);
  assert.ok(r.gates.failed.includes("cl01_pass"));
}]);

cases.push(["E_blocked_verdict_with_error", () => {
  const r = isPass3Successful(
    basePassReport({
      verdict: "BLOCKED",
      errors: [{ id: "X-01", description: "forced failure" }],
      browser: { pass: false },
    }),
    0
  );
  assert.equal(r.ok, false);
  assert.ok(r.gates.failed.includes("not_blocked"));
}]);

cases.push(["F_descriptive_verdict_structured_success", () => {
  const r = isPass3Successful(
    basePassReport({
      verdict: "HUMAN VERIFICATION + PARTNER ANTI-ABUSE FULL STAGING PASS — READY FOR PRODUCTION APPROVAL",
    }),
    0
  );
  assert.equal(r.ok, true);
}]);

cases.push(["G_green_pass3_fixture", () => {
  const r = isPass3Successful(buildGreenPass3ReportFixture(), 0);
  assert.equal(r.ok, true, `fixture failed gates: ${JSON.stringify(r.gates?.failed || [])}`);
}]);

cases.push(["H_missing_production_audit_gate", () => {
  const r = isPass3Successful(
    basePassReport({
      productionReadOnlyAudit: { completed: false },
    }),
    0
  );
  assert.equal(r.ok, false);
  assert.ok(r.gates.failed.includes("production_audit_ok"));
}]);

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}
if (failed > 0) process.exit(1);
console.log(JSON.stringify({ verdict: "PASS", cases: cases.length }, null, 2));
