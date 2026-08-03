#!/usr/bin/env node
/**
 * Generate Enterprise Operations reports and dashboards (no live service probes).
 */
import fs from "node:fs";
import { buildOpsPlatform } from "./platform.mjs";
import { createOpsPaths } from "./paths.mjs";
import { renderAllDashboards } from "./render/html.mjs";

const paths = createOpsPaths();
const platform = buildOpsPlatform();

fs.writeFileSync(paths.files.platformJson, JSON.stringify(platform, null, 2));
fs.copyFileSync(paths.files.platformJson, paths.files.platformLatest);

fs.writeFileSync(paths.files.sloJson, JSON.stringify(platform.sloVerification, null, 2));
fs.writeFileSync(paths.files.errorBudgetJson, JSON.stringify(platform.errorBudget, null, 2));
fs.writeFileSync(paths.files.dependencyJson, JSON.stringify(platform.dependencyGraph, null, 2));
fs.writeFileSync(paths.files.incidentJson, JSON.stringify(platform.incidentReport, null, 2));
fs.writeFileSync(paths.files.alertsJson, JSON.stringify(platform.alertRules, null, 2));
fs.writeFileSync(paths.files.deploymentJson, JSON.stringify(platform.deploymentVerification, null, 2));

for (const [file, html] of renderAllDashboards(platform, paths.files)) {
  fs.writeFileSync(file, html);
  const latestMap = {
    [paths.files.indexHtml]: paths.files.indexLatest,
    [paths.files.monitoringHtml]: paths.files.monitoringLatest,
    [paths.files.healthHtml]: paths.files.healthLatest,
    [paths.files.productionHtml]: paths.files.productionLatest,
    [paths.files.executiveHtml]: paths.files.executiveLatest,
  };
  if (latestMap[file]) fs.copyFileSync(file, latestMap[file]);
}

console.log("\n=== Enterprise Operations Platform ===");
console.log(`Run ID: ${paths.runId}`);
console.log(`QA source: ${platform.qaSource?.runId || "none"}`);
console.log(`Verdict: ${platform.executiveDashboard.verdict}`);
console.log(`Score: ${platform.executiveDashboard.readinessScore}/100`);
console.log(`Incidents: ${platform.incidentReport.incidentCount}`);
console.log(`Alerts fired: ${platform.alertRules.firedCount}`);
console.log(`\nJSON: ${paths.files.platformJson}`);
console.log(`Dashboards: ${paths.dirs.dashboards}`);
console.log(`Open: ${paths.files.indexLatest}\n`);
