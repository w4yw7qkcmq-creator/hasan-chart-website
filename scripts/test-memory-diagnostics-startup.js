import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const hooks = fileURLToPath(new URL("./memory-diagnostics-register-hooks.mjs", import.meta.url));
const SECRET = "user@example.com secret-token BTCUSDT";

if (process.env.MEMORY_DIAG_STARTUP_CHILD !== "1") {
  const scenarios = ["off", "enabled", "import-fail", "start-fail"];
  let failed = 0;

  for (const scenario of scenarios) {
    const env = {
      ...process.env,
      MEMORY_DIAG_STARTUP_CHILD: "1",
      SCENARIO: scenario,
      NEXT_RUNTIME: "nodejs",
    };
    delete env.MEMORY_DIAGNOSTICS;
    delete env.MEMORY_DIAGNOSTICS_IMPORT_FAIL;
    delete env.MEMORY_DIAGNOSTICS_START_FAIL;

    if (scenario === "enabled") {
      env.MEMORY_DIAGNOSTICS = "1";
    }
    if (scenario === "import-fail") {
      env.MEMORY_DIAGNOSTICS = "1";
      env.MEMORY_DIAGNOSTICS_IMPORT_FAIL = "1";
    }
    if (scenario === "start-fail") {
      env.MEMORY_DIAGNOSTICS = "1";
      env.MEMORY_DIAGNOSTICS_START_FAIL = "1";
    }

    const result = spawnSync(process.execPath, ["--import", hooks, self], {
      env,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      failed += 1;
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
      console.error(`startup scenario failed: ${scenario}`);
    } else {
      console.log(`startup scenario passed: ${scenario}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }

  console.log("memory diagnostics startup tests passed");
  process.exit(0);
}

const assert = (await import("node:assert/strict")).default;
const scenario = process.env.SCENARIO;

globalThis.__instrumentationCalls = [];
delete globalThis.__diagnosticsImported;
delete globalThis.__okxMarketStreamHub;
delete globalThis.__hcMemoryDiagnostics;
process.env.NEXT_RUNTIME = "nodejs";

if (scenario === "enabled") {
  process.env.MEMORY_DIAGNOSTICS = "1";
}
if (scenario === "import-fail") {
  process.env.MEMORY_DIAGNOSTICS = "1";
  process.env.MEMORY_DIAGNOSTICS_IMPORT_FAIL = "1";
}
if (scenario === "start-fail") {
  process.env.MEMORY_DIAGNOSTICS = "1";
  process.env.MEMORY_DIAGNOSTICS_START_FAIL = "1";
}
if (scenario === "off") {
  delete process.env.MEMORY_DIAGNOSTICS;
}

const logs = [];
const originalError = console.error;
console.error = (line) => {
  logs.push(String(line));
};

let intervals = 0;
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = (callback, delay, ...rest) => {
  intervals += 1;
  return originalSetInterval(callback, delay, ...rest);
};

const instrumentation = await import("../instrumentation.js");
await instrumentation.register();

if (scenario === "enabled") {
  await instrumentation.register();
}

console.error = originalError;
globalThis.setInterval = originalSetInterval;

function callsNamed(name) {
  return globalThis.__instrumentationCalls.filter((entry) => {
    return entry === name || (Array.isArray(entry) && entry[0] === name);
  });
}

assert.equal(typeof instrumentation.onRequestError, "function");
assert.equal(instrumentation.onRequestError.stub, "sentry-stub");
assert.deepEqual(globalThis.__instrumentationCalls.slice(0, 6), [
  "sentry.server",
  ["guard", "instrumentation.js::register"],
  "supabase",
  "albums",
  ["market", "instrumentation-register"],
  ["registry", "instrumentation-register"],
]);
assert.equal(globalThis.__okxMarketStreamHub, undefined);

if (scenario === "off") {
  assert.equal(globalThis.__diagnosticsImported, undefined);
  assert.equal(intervals, 0);
  assert.equal(logs.length, 0);
  assert.equal(callsNamed("market").length, 1);
  assert.equal(callsNamed("registry").length, 1);
}

if (scenario === "enabled") {
  assert.equal(globalThis.__diagnosticsImported, true);
  assert.equal(intervals, 1);
  assert.equal(globalThis.__hcMemoryDiagnostics?.pending, false);
  assert.ok(globalThis.__hcMemoryDiagnostics?.timer);
  assert.equal(logs.length, 0);
  assert.equal(callsNamed("sentry.server").length, 1);
  assert.equal(callsNamed("guard").length, 2);
  assert.equal(callsNamed("albums").length, 2);
  assert.equal(callsNamed("market").length, 2);
  assert.equal(callsNamed("registry").length, 2);
  const { stopMemoryDiagnostics } = await import("../lib/memory-diagnostics.js");
  stopMemoryDiagnostics();
  assert.equal(globalThis.__hcMemoryDiagnostics, undefined);
}

if (scenario === "import-fail" || scenario === "start-fail") {
  assert.equal(intervals, 0);
  assert.equal(globalThis.__hcMemoryDiagnostics, undefined);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    level: "error",
    event: "memory_diagnostics_failed",
  });
  assert.equal(logs[0].includes(SECRET), false);
  assert.equal(logs[0].includes("user@example.com"), false);
  assert.equal(callsNamed("market").length, 1);
  assert.equal(callsNamed("registry").length, 1);
  assert.equal(callsNamed("sentry.server").length, 1);
}

if (scenario === "import-fail") {
  assert.equal(globalThis.__diagnosticsImported, undefined);
}

if (scenario === "start-fail") {
  assert.equal(globalThis.__diagnosticsImported, true);
}
