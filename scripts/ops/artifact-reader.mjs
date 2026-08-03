import fs from "node:fs";
import path from "node:path";
import { findLatestE2eRun } from "./paths.mjs";

/**
 * Read latest QA artifacts (no network, no service execution).
 */
export function loadQaArtifacts() {
  const latest = findLatestE2eRun();
  if (!latest) {
    return {
      available: false,
      runId: null,
      smoke: null,
      releaseGate: null,
      cleanup: null,
      note: "No smoke.json found — run npm run smoke first for live artifact data.",
    };
  }

  const dir = path.dirname(latest.smokePath);
  const smoke = JSON.parse(fs.readFileSync(latest.smokePath, "utf8"));
  let releaseGate = null;
  let cleanup = null;

  const gatePath = path.join(dir, "release-gate.json");
  const cleanupPath = path.join(dir, "cleanup-report.json");
  if (fs.existsSync(gatePath)) releaseGate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  if (fs.existsSync(cleanupPath)) cleanup = JSON.parse(fs.readFileSync(cleanupPath, "utf8"));

  return {
    available: true,
    runId: latest.runId,
    smokePath: latest.smokePath,
    smoke,
    releaseGate,
    cleanup,
    note: `Loaded QA artifacts from run ${latest.runId}`,
  };
}

export function stepStatus(smoke, id) {
  return smoke?.steps?.find((s) => s.id === id)?.status || "UNKNOWN";
}

export function stepNote(smoke, id) {
  return smoke?.steps?.find((s) => s.id === id)?.note || "";
}
