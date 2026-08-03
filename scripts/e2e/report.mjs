import fs from "node:fs";
import path from "node:path";
import { writeHtmlReport } from "./html-report.mjs";
import { finalizeMetadata } from "./metadata.mjs";
import { writeReleaseGate } from "./release-gate.mjs";

/**
 * @typedef {Object} StepRecord
 * @property {string} id
 * @property {string} name
 * @property {"PASS" | "FAIL" | "BLOCKED" | "MANUAL_REQUIRED" | "VERIFY_ONLY"} status
 * @property {number} durationMs
 * @property {string} [note]
 * @property {boolean} [retried]
 */

export class SmokeReporter {
  /**
   * @param {string} baseUrl
   * @param {object} [options]
   * @param {import('./paths.mjs').createRunPaths extends (...args: any) => infer R ? R : never} [options.runPaths]
   * @param {object} [options.metadata]
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.runPaths = options.runPaths || null;
    this.metadata = options.metadata || {};
    this.startedAt = Date.now();
    /** @type {StepRecord[]} */
    this.steps = [];
    /** @type {Record<string, string[]>} */
    this.cleanup = {
      userIds: [],
      requestIds: [],
      alertIds: [],
      uploadPaths: [],
      jobIds: [],
      storagePaths: [],
    };
    this.visual = null;
    this.consoleCapture = null;
    this.performancePages = [];
  }

  track(category, value) {
    if (value == null || value === "") return;
    const map = {
      sessionId: "uploadPaths",
      objectPath: "storagePaths",
      userId: "userIds",
      requestId: "requestIds",
      alertId: "alertIds",
      jobId: "jobIds",
    };
    const key = map[category] || `${category}s`;
    const bucket = this.cleanup[key] || this.cleanup.storagePaths;
    if (Array.isArray(bucket) && !bucket.includes(value)) {
      bucket.push(value);
    }
  }

  setVisualResult(result, runPaths) {
    this.visual = result;
    this.consoleCapture = result?.console || null;
    this.performancePages = (result?.pages || []).map((p) => ({
      ...p,
      jsErrors: result?.console?.consoleErrors || 0,
      failedRequests: result?.console?.networkFailures || 0,
    }));

    for (const v of result?.visualResults || []) {
      if (runPaths?.dirs?.screenshots && v.file) {
        v.screenshotPath = path.join(runPaths.dirs.screenshots, v.file);
        const diff = path.join(runPaths.dirs.screenshots, v.file.replace(".png", ".diff.png"));
        if (fs.existsSync(diff)) v.diffPath = diff;
      }
    }
  }

  /**
   * @param {string} id
   * @param {string} name
   * @param {() => Promise<{ status?: StepRecord["status"], note?: string, retried?: boolean }>} fn
   */
  async runStep(id, name, fn) {
    const t0 = Date.now();
    let status = /** @type {StepRecord["status"]} */ ("FAIL");
    let note = "";
    let retried = false;
    try {
      const result = await fn();
      status = result?.status || "PASS";
      note = result?.note || "";
      retried = Boolean(result?.retried);
    } catch (error) {
      status = "FAIL";
      note = error?.message || String(error);
    }
    const record = { id, name, status, durationMs: Date.now() - t0, note, retried };
    this.steps.push(record);
    const icon =
      status === "PASS"
        ? "✓"
        : status === "VERIFY_ONLY"
          ? "◐"
          : status === "BLOCKED"
            ? "⊘"
            : status === "MANUAL_REQUIRED"
              ? "?"
              : "✗";
    console.log(
      `${icon} [${id}] ${name} — ${status} (${record.durationMs}ms)${note ? ` — ${note}` : ""}${retried ? " [retried]" : ""}`
    );
    return record;
  }

  summary() {
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, MANUAL_REQUIRED: 0, VERIFY_ONLY: 0 };
    for (const step of this.steps) {
      counts[step.status] = (counts[step.status] || 0) + 1;
    }
    return counts;
  }

  verdict() {
    const counts = this.summary();
    if (counts.FAIL > 0) return "NO-GO";
    if (counts.BLOCKED > 0 || counts.MANUAL_REQUIRED > 0) return "GO WITH KNOWN ISSUES";
    return "GO";
  }

  printReport() {
    const counts = this.summary();
    const totalMs = Date.now() - this.startedAt;
    console.log("\n========================================");
    console.log("Smoke Test Report");
    console.log("========================================");
    console.log(`Target: ${this.baseUrl}`);
    console.log(`Duration: ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`Verdict: ${this.verdict()}`);
    console.log(
      `PASS=${counts.PASS} FAIL=${counts.FAIL} BLOCKED=${counts.BLOCKED} MANUAL_REQUIRED=${counts.MANUAL_REQUIRED} VERIFY_ONLY=${counts.VERIFY_ONLY}`
    );
    console.log("\n--- Steps ---");
    for (const step of this.steps) {
      console.log(
        `${step.status.padEnd(16)} ${String(step.durationMs).padStart(5)}ms  ${step.id} — ${step.name}${step.note ? ` (${step.note})` : ""}`
      );
    }
    console.log("\n--- Cleanup Report (do not auto-delete) ---");
    console.log(JSON.stringify(this.cleanup, null, 2));
    console.log("========================================\n");
  }

  buildPayload() {
    const metadata = finalizeMetadata(this.metadata);
    return {
      runId: this.runPaths?.runId,
      runPaths: this.runPaths,
      baseUrl: this.baseUrl,
      metadata,
      verdict: this.verdict(),
      summary: this.summary(),
      steps: this.steps,
      cleanup: this.cleanup,
      visual: this.visual,
      consoleCapture: this.consoleCapture,
      performancePages: this.performancePages,
    };
  }

  writeReports() {
    if (!this.runPaths) {
      throw new Error("runPaths required — use createRunPaths()");
    }

    const payload = this.buildPayload();
    const { files, dirs } = this.runPaths;

    fs.writeFileSync(files.smokeJson, JSON.stringify(payload, null, 2));
    fs.writeFileSync(files.cleanupJson, JSON.stringify(this.cleanup, null, 2));

    const releaseGate = writeReleaseGate(payload, files.releaseGateJson, { cleanup: this.cleanup });
    fs.writeFileSync(files.releaseGateLatest, JSON.stringify(releaseGate, null, 2));
    payload.releaseGate = releaseGate;

    writeHtmlReport(payload, files.htmlReport);
    fs.copyFileSync(files.htmlReport, files.htmlReportLatest);

    console.log(`JSON report: ${files.smokeJson}`);
    console.log(`Cleanup report: ${files.cleanupJson}`);
    console.log(`Release Gate: ${releaseGate.verdict} (${releaseGate.score}/100) → ${files.releaseGateJson}`);
    console.log(`HTML report: ${files.htmlReport}`);
    console.log(`Latest HTML: ${files.htmlReportLatest}`);
    console.log(`Screenshots: ${dirs.screenshots}`);

    return {
      smokeJson: files.smokeJson,
      cleanupJson: files.cleanupJson,
      releaseGateJson: files.releaseGateJson,
      htmlReport: files.htmlReport,
      releaseGate,
    };
  }

  /** @deprecated use writeReports */
  writeArtifactsFile(rootDir) {
    const outDir = path.join(rootDir, "scripts/e2e/.artifacts/json/legacy");
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `smoke-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(this.buildPayload(), null, 2));
    return file;
  }
}
