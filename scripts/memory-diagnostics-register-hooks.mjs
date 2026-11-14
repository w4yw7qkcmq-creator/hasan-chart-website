import { register } from "node:module";

const HOOK_URL = new URL(import.meta.url);

if (process.env.MEMORY_DIAG_HOOKS_REGISTERED !== "1") {
  process.env.MEMORY_DIAG_HOOKS_REGISTERED = "1";
  register(HOOK_URL.href);
}

const STUBS = {
  "stub:sentry-next": `
    export function captureRequestError() {}
    captureRequestError.stub = "sentry-stub";
  `,
  "stub:sentry-server": `
    globalThis.__instrumentationCalls.push("sentry.server");
    export {};
  `,
  "stub:price-guard": `
    export function announceWebsitePriceAlertEmailGuard(source) {
      globalThis.__instrumentationCalls.push(["guard", source]);
    }
  `,
  "stub:albums": `
    export function recoverTelegramAlbumTimersOnStartup() {
      globalThis.__instrumentationCalls.push("albums");
      return Promise.resolve({ recovered: 0 });
    }
  `,
  "stub:auth": `
    export function getSupabaseAdmin() {
      globalThis.__instrumentationCalls.push("supabase");
      return { stub: true };
    }
  `,
  "stub:okx": `
    export function startMarketStream(reason) {
      globalThis.__instrumentationCalls.push(["market", reason]);
    }
  `,
  "stub:registry": `
    export function warmupSymbolRegistry(reason) {
      globalThis.__instrumentationCalls.push(["registry", reason]);
    }
  `,
  "stub:diagnostics-import-fail": `
    throw new Error("user@example.com secret-token BTCUSDT");
  `,
  "stub:diagnostics-start-fail": `
    globalThis.__diagnosticsImported = true;
    export function startMemoryDiagnostics() {
      throw new Error("user@example.com secret-token BTCUSDT");
    }
  `,
};

function fromInstrumentation(context) {
  return context.parentURL?.endsWith("/instrumentation.js") === true;
}

export async function resolve(specifier, context, nextResolve) {
  if (!fromInstrumentation(context)) {
    return nextResolve(specifier, context);
  }

  const stubs = {
    "@sentry/nextjs": "stub:sentry-next",
    "./sentry.server.config.js": "stub:sentry-server",
    "./lib/price-alert-email-guard.js": "stub:price-guard",
    "./lib/telegram-content/album-liveness-scheduler.js": "stub:albums",
    "./lib/auth-session.js": "stub:auth",
    "./lib/okx-market-stream.js": "stub:okx",
    "./lib/market-data/symbol-registry.js": "stub:registry",
  };

  if (stubs[specifier]) {
    return { url: stubs[specifier], shortCircuit: true };
  }

  if (
    specifier === "./lib/memory-diagnostics.js" ||
    specifier.endsWith("/lib/memory-diagnostics.js")
  ) {
    if (process.env.MEMORY_DIAGNOSTICS_IMPORT_FAIL === "1") {
      return { url: "stub:diagnostics-import-fail", shortCircuit: true };
    }
    if (process.env.MEMORY_DIAGNOSTICS_START_FAIL === "1") {
      return { url: "stub:diagnostics-start-fail", shortCircuit: true };
    }
  }

  const resolved = await nextResolve(specifier, context);
  if (resolved.url.endsWith("/lib/memory-diagnostics.js")) {
    if (process.env.MEMORY_DIAGNOSTICS_IMPORT_FAIL === "1") {
      return { url: "stub:diagnostics-import-fail", shortCircuit: true };
    }
    if (process.env.MEMORY_DIAGNOSTICS_START_FAIL === "1") {
      return { url: "stub:diagnostics-start-fail", shortCircuit: true };
    }
    return { url: `${resolved.url}?memory-diagnostics-probe=1`, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  if (STUBS[url]) {
    return {
      format: "module",
      source: STUBS[url],
      shortCircuit: true,
    };
  }

  if (url.includes("/lib/memory-diagnostics.js?memory-diagnostics-probe=1")) {
    const realUrl = url.replace("?memory-diagnostics-probe=1", "");
    const loaded = await nextLoad(realUrl, { ...context, format: "module" });
    const source = `${loaded.source ?? ""}`;
    return {
      format: "module",
      source: `globalThis.__diagnosticsImported = true;\n${source}`,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
