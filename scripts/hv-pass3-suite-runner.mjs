/**
 * Async staging suite runner — bounded timeouts, graceful termination, structured SUITE_TIMEOUT.
 * Harness-only; no product logic changes.
 */
import { spawn } from "node:child_process";
import { ROOT, applyStagingPartnerFeatureFlags } from "./hv-abuse-pass2-lib.mjs";
import { isIsolatedValidationTarget } from "../lib/isolated-env-guard.js";
import {
  assertInterSuiteIsolationZero,
  guaranteedR8OrchestrationCleanup,
} from "./hv-pass3-pregate-cleanup-lib.mjs";

export const SUITE_TIMEOUT_MS = {
  r6: 900_000,
  r7: 900_000,
  r8: 900_000,
  /** Isolated full R8 inside canonical RG-19 — bounded, not unbounded (60m cap). */
  r8_isolated: 3_600_000,
  r8_preflight: 300_000,
  r9: 900_000,
  default: 900_000,
};

const GRACE_MS = 15_000;
/** Normal scenario stall window (user range 5–8 min). */
const R8_STALL_MS = 8 * 60 * 1000;
/** R8-089 reconciliation + R8-090 cleanup can run silently after R8-088 build. */
const R8_TAIL_STALL_MS = 15 * 60 * 1000;
const R8_TAIL_SCENARIO_THRESHOLD = 88;
const R8_INIT_GRACE_MS = 20 * 60 * 1000;
const R8_PROGRESS_POLL_MS = 30_000;
const R8_PROGRESS_LINE = /^(PASS|FAIL|N\/A)\s+(R8-\d+)/;

export function createR8ProgressWatchdog() {
  const startedAt = Date.now();
  let lastScenarioId = null;
  let lastProgressAt = Date.now();
  let lastActivityAt = Date.now();
  let completedScenarioCount = 0;

  const stallWindowMs = () =>
    completedScenarioCount >= R8_TAIL_SCENARIO_THRESHOLD ? R8_TAIL_STALL_MS : R8_STALL_MS;

  return {
    noteActivity() {
      lastActivityAt = Date.now();
    },
    ingestLine(line = "") {
      const text = String(line);
      if (text.trim()) lastActivityAt = Date.now();
      const m = text.trim().match(R8_PROGRESS_LINE);
      if (!m) return;
      lastScenarioId = m[2];
      lastProgressAt = Date.now();
      lastActivityAt = Date.now();
      completedScenarioCount += 1;
    },
    snapshot() {
      const windowMs = stallWindowMs();
      return {
        lastScenarioId,
        lastProgressAt: lastProgressAt ? new Date(lastProgressAt).toISOString() : null,
        lastActivityAt: new Date(lastActivityAt).toISOString(),
        completedScenarioCount,
        noProgressMs: Date.now() - lastProgressAt,
        noActivityMs: Date.now() - lastActivityAt,
        initGraceMs: R8_INIT_GRACE_MS,
        stallWindowMs: windowMs,
        tailMode: completedScenarioCount >= R8_TAIL_SCENARIO_THRESHOLD,
      };
    },
    isStalled() {
      if (completedScenarioCount === 0) {
        return Date.now() - startedAt >= R8_INIT_GRACE_MS;
      }
      const windowMs = stallWindowMs();
      const now = Date.now();
      return now - lastProgressAt >= windowMs && now - lastActivityAt >= windowMs;
    },
  };
}

function suiteTimeoutFor(name, extraEnv = {}) {
  if (extraEnv.R8_PREFLIGHT_ONLY === "1") return SUITE_TIMEOUT_MS.r8_preflight;
  if (name === "r8" || name === "r8_staging") {
    return isIsolatedValidationTarget() ? SUITE_TIMEOUT_MS.r8_isolated : SUITE_TIMEOUT_MS.r8;
  }
  if (name === "r6" || name === "r6_staging") return SUITE_TIMEOUT_MS.r6;
  if (name === "r7" || name === "r7_staging") return SUITE_TIMEOUT_MS.r7;
  if (name === "r9" || name === "r9_staging") return SUITE_TIMEOUT_MS.r9;
  return SUITE_TIMEOUT_MS.default;
}

function parseSuiteResult(name, { exitCode, signal, stdout, stderr, elapsedMs, timedOut, stalled = false, progressWatchdog = null, artifactHint = null }) {
  const combined = `${stdout || ""}${stderr || ""}`;
  const tail = combined.slice(-500);
  let passCount = 0;
  let failCount = 0;
  let naCount = 0;
  let verdict = exitCode === 0 && !timedOut && !stalled ? "PASS" : stalled ? "R8_STALLED" : timedOut ? "SUITE_TIMEOUT" : "FAIL";

  if (stalled) {
    return {
      name,
      exit: exitCode,
      signal,
      verdict,
      passCount,
      failCount,
      elapsedMs,
      tail,
      timedOut: false,
      stalled: true,
      progressWatchdog: progressWatchdog?.snapshot?.() || progressWatchdog || null,
      artifactHint,
      error: "R8_STALLED",
    };
  }

  if (timedOut) {
    return {
      name,
      exit: exitCode,
      signal,
      verdict,
      passCount,
      failCount,
      elapsedMs,
      tail,
      timedOut: true,
      stalled: false,
      progressWatchdog: progressWatchdog?.snapshot?.() || progressWatchdog || null,
      artifactHint,
      error: "SUITE_TIMEOUT",
    };
  }

  if (/VERDICT PASS|PASS = \d+ \| FAIL = 0|0 FAIL/i.test(combined)) verdict = "PASS";
  const summaryMatch = combined.match(/PASS = (\d+) \| FAIL = (\d+)(?: \| N\/A = (\d+))?/);
  if (summaryMatch) {
    passCount = Number(summaryMatch[1]);
    failCount = Number(summaryMatch[2]);
    naCount = summaryMatch[3] != null ? Number(summaryMatch[3]) : 0;
    verdict = failCount === 0 && exitCode === 0 && !timedOut && !stalled ? "PASS" : failCount > 0 ? "FAIL" : verdict;
  }
  const passM = combined.match(/PASS = (\d+)/);
  if (passM) passCount = Number(passM[1]);
  const failM = combined.match(/FAIL = (\d+)/);
  if (failM) failCount = Number(failM[1]);
  const naM = combined.match(/N\/A = (\d+)/);
  if (naM) naCount = Number(naM[1]);

  return {
    name,
    exit: exitCode,
    signal,
    verdict,
    passCount,
    failCount,
    naCount,
    elapsedMs,
    tail,
    stdout,
    timedOut: false,
    artifactHint,
    progressWatchdog: progressWatchdog?.snapshot?.() || progressWatchdog || null,
  };
}

export function runSuiteAsync(script, name, options = {}) {
  const started = Date.now();
  const extraEnv = options.env || {};
  const timeoutMs = options.timeoutMs ?? suiteTimeoutFor(name, extraEnv);
  const artifactHint = options.artifactHint || null;
  const progressWatchdog =
    options.progressWatchdog === "r8" || name === "r8" || name === "r8_staging"
      ? createR8ProgressWatchdog()
      : null;

  return new Promise((resolve) => {
    const child = spawn("node", [script], {
      cwd: ROOT,
      env: applyStagingPartnerFeatureFlags({ ...process.env, ...extraEnv }),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const ingest = (chunk, target) => {
      const text = chunk.toString();
      target === "stdout" ? (stdout += text) : (stderr += text);
      if (!progressWatchdog) return;
      if (text.trim()) progressWatchdog.noteActivity();
      for (const line of text.split(/\r?\n/)) progressWatchdog.ingestLine(line);
    };
    child.stdout?.on("data", (chunk) => ingest(chunk, "stdout"));
    child.stderr?.on("data", (chunk) => ingest(chunk, "stderr"));

    let finished = false;
    let timedOut = false;
    let stalled = false;
    let hardKillTimer = null;

    const finish = (exitCode, signal) => {
      if (finished) return;
      finished = true;
      if (hardKillTimer) clearTimeout(hardKillTimer);
      clearTimeout(timeoutTimer);
      if (stallTimer) clearInterval(stallTimer);
      resolve(
        parseSuiteResult(name, {
          exitCode,
          signal,
          stdout,
          stderr,
          elapsedMs: Date.now() - started,
          timedOut,
          stalled,
          progressWatchdog,
          artifactHint,
        })
      );
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => {
        if (!finished) child.kill("SIGKILL");
      }, GRACE_MS);
    }, timeoutMs);

    const stallTimer = progressWatchdog
      ? setInterval(() => {
          if (finished || timedOut || stalled) return;
          if (!progressWatchdog.isStalled()) return;
          stalled = true;
          child.kill("SIGTERM");
          hardKillTimer = setTimeout(() => {
            if (!finished) child.kill("SIGKILL");
          }, GRACE_MS);
        }, R8_PROGRESS_POLL_MS)
      : null;

    child.on("error", (err) => {
      stderr += `\n${String(err?.message || err)}`;
      finish(1, null);
    });
    child.on("close", (code, signal) => finish(code ?? 1, signal));
  });
}

export async function runSuiteWithIsolation(service, script, name, options = {}) {
  const result = await runSuiteAsync(script, name, options);
  const needsR8Cleanup =
    name === "r8" ||
    name === "r8_staging" ||
    name === "r8_preflight" ||
    options.env?.R8_PREFLIGHT_ONLY === "1";

  if (needsR8Cleanup && service) {
    result.r8Cleanup = await guaranteedR8OrchestrationCleanup(service, {
      reason: result.stalled ? "r8_stalled" : result.timedOut ? "suite_timeout" : result.verdict === "PASS" ? "suite_pass" : "suite_fail",
    });
  } else if (
    service &&
    process.env.HV_VALIDATION_TARGET === "isolated" &&
    ["r6", "r6_staging", "r7", "r7_staging", "r9", "r9_staging"].includes(name)
  ) {
    const { purgeIsolatedHarnessBusinessResidue } = await import("./hv-pass3-pregate-cleanup-lib.mjs");
    result.postSuitePurge = await purgeIsolatedHarnessBusinessResidue(service);
  }

  if (service && options.interSuiteGate !== false) {
    result.interSuite = await assertInterSuiteIsolationZero(service, `after_${name}`);
  }

  return result;
}

export async function runStagingSuiteChain(service, suites, { stopOnIsolationFailure = true } = {}) {
  const results = {};
  const interSuiteGates = [];

  for (const spec of suites) {
    const result = await runSuiteWithIsolation(service, spec.script, spec.name, spec.options || {});
    results[spec.key || spec.name] = result;
    interSuiteGates.push({ suite: spec.name, ...(result.interSuite || {}) });

    if (stopOnIsolationFailure && result.interSuite && !result.interSuite.ok) {
      return { results, interSuiteGates, blocked: true, blockedSuite: spec.name };
    }
    if (spec.requiredVerdict && result.verdict !== spec.requiredVerdict) {
      return { results, interSuiteGates, blocked: true, blockedSuite: spec.name };
    }
  }

  return { results, interSuiteGates, blocked: false };
}

export function stagingSuiteChainOk(chainResult, { requireFullR8 = false } = {}) {
  const { results, blocked } = chainResult;
  if (blocked) return false;
  for (const [key, result] of Object.entries(results)) {
    if (key === "r8" && !requireFullR8) {
      if (result.mode === "preflight") {
        if (result.verdict !== "PASS") return false;
        continue;
      }
    }
    if (result.verdict !== "PASS") return false;
    if (result.interSuite && !result.interSuite.ok) return false;
  }
  return true;
}
