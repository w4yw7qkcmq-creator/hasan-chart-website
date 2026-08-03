import fs from "node:fs";
import path from "node:path";

const CV_ARTIFACTS = path.resolve(import.meta.dirname, "../continuous-verification/.artifacts");

/** Read latest CV artifacts for Enterprise Operations (loose coupling). */
export function loadCvArtifactsForOps() {
  const latest = path.join(CV_ARTIFACTS, "continuous-verification.json");
  const timeline = path.join(CV_ARTIFACTS, "timeline.json");
  if (!fs.existsSync(latest)) {
    return { available: false, note: "No continuous-verification.json — run cv:run after deploy" };
  }
  const report = JSON.parse(fs.readFileSync(latest, "utf8"));
  const ageSeconds = report.generatedAt
    ? Math.floor((Date.now() - new Date(report.generatedAt).getTime()) / 1000)
    : null;
  const freshness = !report.generatedAt
    ? "missing"
    : ageSeconds > 86_400
      ? "stale"
      : "fresh";

  let timelineEvents = [];
  if (fs.existsSync(timeline)) timelineEvents = JSON.parse(fs.readFileSync(timeline, "utf8"));

  const openIncidents = report.incidents?.open || [];

  return {
    available: true,
    freshness,
    ageSeconds,
    finalVerdict: report.finalVerdict,
    productionGate: report.productionGate,
    environment: report.environment,
    commit: report.commit,
    generatedAt: report.generatedAt,
    checkpoints: report.checkpoints || [],
    openIncidents,
    timeline: timelineEvents,
    reportPath: latest,
  };
}
