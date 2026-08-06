const HYDRATION_RE =
  /hydration|did not match|server rendered HTML|Text content does not match server-rendered/i;
const REACT_DEV_RE = /react devtools|download the react devtools/i;
const ABORT_RE = /net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i;
const THIRD_PARTY_RE =
  /tradingview|googletagmanager|google-analytics|facebook|hotjar|chunkloaderror/i;

export function attachRuntimeDiagnostics(page, bucket) {
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") bucket.consoleErrors.push({ text, type });
    if (type === "warning") bucket.consoleWarnings.push({ text, type });
    if (HYDRATION_RE.test(text)) bucket.hydrationWarnings.push({ text });
  });

  page.on("pageerror", (error) => {
    bucket.pageErrors.push({ message: error?.message || String(error) });
  });

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) {
      bucket.network5xx.push({ url, status });
      return;
    }
    if (status >= 400) {
      bucket.network4xx.push({ url, status });
    }
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    bucket.requestFailures.push({
      url: request.url(),
      method: request.method(),
      error: failure?.errorText || "failed",
    });
  });
}

export function classifyConsoleIssue(entry, context) {
  const text = entry.text || entry.message || "";
  const url = entry.url || context.url || "";

  if (REACT_DEV_RE.test(text)) return "dev-only";
  if (HYDRATION_RE.test(text)) return "hydration";
  if (THIRD_PARTY_RE.test(text) || THIRD_PARTY_RE.test(url)) return "third-party";
  if (ABORT_RE.test(text) || ABORT_RE.test(entry.error || "")) return "navigation-abort";

  if (entry.status === 401 || entry.status === 403) {
    if (context.expectAuthRedirect) return "auth-expected";
    if (context.authenticated) return "app-defect";
    return "auth-expected";
  }

  if (entry.status === 404) {
    if (/\/favicon|\.map$|\/_next\/static\/media\//i.test(url)) return "benign-404";
  }

  return "app-defect";
}

export function filterActionableIssues(bucket, context = {}) {
  const defects = [];

  for (const item of bucket.consoleErrors) {
    if (classifyConsoleIssue(item, context) === "app-defect") defects.push({ kind: "console.error", ...item });
  }
  for (const item of bucket.consoleWarnings) {
    if (/react/i.test(item.text) && classifyConsoleIssue(item, context) !== "dev-only") {
      defects.push({ kind: "console.warning", ...item });
    }
  }
  for (const item of bucket.hydrationWarnings) {
    defects.push({ kind: "hydration", ...item });
  }
  for (const item of bucket.pageErrors) {
    if (classifyConsoleIssue(item, context) === "app-defect") defects.push({ kind: "pageerror", ...item });
  }
  for (const item of bucket.network5xx) {
    defects.push({ kind: "network5xx", ...item });
  }
  for (const item of bucket.network4xx) {
    if (classifyConsoleIssue(item, context) === "app-defect") {
      defects.push({ kind: "network4xx", ...item });
    }
  }
  for (const item of bucket.requestFailures) {
    if (classifyConsoleIssue(item, context) === "app-defect") {
      defects.push({ kind: "requestfailed", ...item });
    }
  }

  return defects;
}

export async function readPageDiagnostics(page) {
  return page.evaluate(() => {
    const body = document.body;
    const root = document.documentElement;
    const overflowX = Math.max(
      body.scrollWidth - body.clientWidth,
      root.scrollWidth - root.clientWidth,
    );
    const bodyColor = getComputedStyle(body).color;
    const bodyBg = getComputedStyle(body).backgroundColor;
    return {
      title: document.title,
      theme: root.getAttribute("data-theme"),
      dir: root.getAttribute("dir"),
      overflowX,
      bodyColor,
      bodyBg,
    };
  });
}

export function createEmptyBucket() {
  return {
    consoleErrors: [],
    consoleWarnings: [],
    hydrationWarnings: [],
    pageErrors: [],
    network4xx: [],
    network5xx: [],
    requestFailures: [],
  };
}

export async function setTheme(page, theme) {
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.setAttribute("dir", "rtl");
  }, theme);
}
