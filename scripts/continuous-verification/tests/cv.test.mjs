import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRetry, isRetryable } from "../retry.mjs";
import { assessFreshness } from "../freshness.mjs";
import { deriveCheckpointVerdict, deriveFinalVerdict, assessLatency } from "../report-engine.mjs";
import { runReleaseGate } from "../probes/release-gate.mjs";
import { mergeIncidents, createIncident, markRecovered } from "../incidents.mjs";
import { runCheckpoint, buildProbeContext } from "../runner.mjs";
import { evaluatePostDeployCv } from "../../e2e/release-gate.mjs";
import { maskSecrets } from "../report-engine.mjs";

function mockFetch(responses) {
  const entries = Array.isArray(responses) ? responses : Object.entries(responses);
  const map = new Map(entries);
  return async (path) => {
    const key = [...map.keys()].find((k) => path.includes(k));
    if (!key) throw new Error(`unexpected path ${path}`);
    const val = map.get(key);
    if (val instanceof Error) throw val;
    return val;
  };
}

describe("Continuous Verification mocks", () => {
  it("all probes pass → HEALTHY", async () => {
    const fetchJson = mockFetch({
      "/api/health": { res: { status: 200 }, data: { status: "ok", readiness: "ready", build: { commit: "abc1234" } } },
      "/api/market-depth/snapshot": {
        res: { status: 200 },
        data: { success: true, lastPrice: 1, bids: [1], asks: [1], connectedExchangeCount: 3 },
      },
      "/api/news": { res: { status: 200 }, data: { success: true, items: [{}] } },
      "/login": { res: { status: 200 }, data: {} },
      "/api/admin/dashboard": { res: { status: 401 }, data: {} },
    });
    const fetchRaw = async () => ({ status: 200, text: "ok" });
    const incDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-inc-"));
    const cp = await runCheckpoint("t1m", {
      env: { environment: "test", expectedCommit: "abc1234", dryRun: false, baseUrl: "http://test", root: process.cwd() },
      paths: { files: { incidentsDir: incDir }, opsArtifacts: incDir },
      ctxOverrides: true,
      fetchJson,
      fetchRaw,
      operationalArtifacts: {
        releaseGate: { freshness: { status: "fresh", ageSeconds: 100, generatedAt: new Date().toISOString() }, data: { verdict: "GO" } },
        incidentReport: { freshness: { status: "fresh", ageSeconds: 100 } },
        errorBudget: { freshness: { status: "fresh", ageSeconds: 100 } },
        alertRules: { freshness: { status: "fresh", ageSeconds: 100 } },
        deploymentVerification: { freshness: { status: "fresh", ageSeconds: 100 } },
        commitMatch: "match",
      },
    });
    assert.equal(cp.verdict, "HEALTHY");
  });

  it("transient 503 then pass → recovered", async () => {
    let calls = 0;
    const fetchJson = async (path) => {
      if (path.includes("/api/health")) {
        calls++;
        if (calls === 1) throw Object.assign(new Error("503"), { httpStatus: 503 });
        return { res: { status: 200 }, data: { status: "ok", readiness: "ready" } };
      }
      return { res: { status: 200 }, data: { success: true, items: [] } };
    };
    const r = await withRetry(async () => {
      const { res, data } = await fetchJson("/api/health");
      if (res.status !== 200) throw Object.assign(new Error(String(res.status)), { httpStatus: res.status });
      return { status: "PASS", data };
    });
    assert.equal(r.retryStatus, "Retried Successfully");
  });

  it("web health fail → P0 + UNHEALTHY", () => {
    const verdict = deriveCheckpointVerdict([
      { probe: "web-health", status: "FAIL", priority: "P0" },
      { probe: "news", status: "PASS" },
    ]);
    assert.equal(verdict, "UNHEALTHY");
  });

  it("workers probe fail → P1", () => {
    const verdict = deriveCheckpointVerdict([
      { probe: "web-health", status: "PASS" },
      { probe: "workers", status: "FAIL", priority: "P1" },
    ]);
    assert.equal(verdict, "UNHEALTHY");
  });

  it("stale release-gate artifact → WARN not auto FAIL", () => {
    const r = runReleaseGate({
      operationalArtifacts: {
        releaseGate: {
          freshness: { status: "stale", ageSeconds: 90000 },
          data: { verdict: "GO" },
        },
      },
    });
    assert.equal(r.status, "WARN");
  });

  it("missing release-gate → UNKNOWN", () => {
    const r = runReleaseGate({ operationalArtifacts: { releaseGate: { freshness: { status: "missing" } } } });
    assert.equal(r.status, "UNKNOWN");
  });

  it("order-book warmup then pass via mock", async () => {
    let n = 0;
    const fetchJson = async () => {
      n++;
      if (n < 2) return { res: { status: 200 }, data: { bids: [], asks: [], connectedExchangeCount: 0 } };
      return { res: { status: 200 }, data: { lastPrice: 1, bids: [1], asks: [1], connectedExchangeCount: 2 } };
    };
    const { runOrderBook } = await import("../probes/order-book.mjs");
    const r = await runOrderBook({ fetchJson });
    assert.equal(r.status, "PASS");
  });

  it("latency warning → P2", () => {
    const l = assessLatency("web-health", 900);
    assert.equal(l.priority, "P2");
  });

  it("latency critical → P1", () => {
    const l = assessLatency("order-book", 9000);
    assert.equal(l.priority, "P1");
  });

  it("incident recovery", () => {
    const inc = createIncident({
      checkpoint: { id: "t1m", label: "T+1m" },
      environment: "test",
      commit: "abc",
      failedProbes: [{ id: "news" }],
      probeResults: [{ probe: "news", status: "FAIL" }],
    });
    const recovered = markRecovered(inc, { id: "t5m" }, [{ probe: "news", status: "PASS" }]);
    assert.equal(recovered.status, "recovered");
    assert.ok(recovered.recoveredAt);
  });

  it("incomplete run", () => {
    const v = deriveFinalVerdict({ checkpoints: [], incidents: [], completedCheckpointIds: [], expectedCheckpointIds: ["t1m", "t5m"] });
    assert.equal(v, "INCOMPLETE");
  });

  it("no secrets in reports", () => {
    const masked = maskSecrets("token=secret123&password=foo");
    assert.match(masked, /token=\*\*\*/);
    assert.doesNotMatch(masked, /secret123/);
  });

  it("401 not retryable", () => {
    assert.equal(isRetryable(new Error("auth"), 401), false);
  });

  it("post-deploy P0 → rollback", () => {
    const g = evaluatePostDeployCv({
      finalVerdict: "DEGRADED",
      incidents: { open: [{ severity: "P0" }] },
    });
    assert.equal(g.rollbackRecommended, true);
  });

  it("freshness stale", () => {
    const old = new Date(Date.now() - 90000 * 1000).toISOString();
    assert.equal(assessFreshness(old, 86400).status, "stale");
  });
});
