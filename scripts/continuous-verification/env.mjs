import fs from "node:fs";
import path from "node:path";

const CV_ROOT = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(CV_ROOT, "../..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

function resolveEnvironment(merged) {
  const e = String(merged.CV_ENVIRONMENT || "").toLowerCase();
  if (e === "local" || e === "staging" || e === "production") return e;
  return "custom";
}

function resolveBaseUrl(merged, environment) {
  if (environment === "local") return String(merged.LOCAL_URL || "http://localhost:3000").replace(/\/$/, "");
  if (environment === "staging") {
    const u = merged.STAGING_URL || merged.CV_BASE_URL;
    if (!u) throw new Error("STAGING_URL required for CV staging");
    return String(u).replace(/\/$/, "");
  }
  if (environment === "production") {
    const u = merged.PROD_URL || merged.CV_BASE_URL;
    if (!u) throw new Error("PROD_URL required for CV production");
    return String(u).replace(/\/$/, "");
  }
  return String(merged.CV_BASE_URL || merged.LOCAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function loadCvEnv() {
  const merged = {
    ...parseEnvFile(path.join(REPO_ROOT, ".env.local")),
    ...parseEnvFile(path.join(REPO_ROOT, ".env.cv.local")),
    ...process.env,
  };
  const environment = resolveEnvironment(merged);
  return {
    root: REPO_ROOT,
    cvRoot: CV_ROOT,
    environment,
    baseUrl: resolveBaseUrl(merged, environment),
    expectedCommit: merged.CV_EXPECTED_COMMIT?.trim() || "",
    dryRun: merged.CV_DRY_RUN === "1" || merged.CV_DRY_RUN === "true",
  };
}
