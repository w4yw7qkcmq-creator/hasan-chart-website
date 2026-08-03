#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findLatestCvRun } from "./paths.mjs";
import { writeCvReport } from "./report.mjs";
import { createCvPaths } from "./paths.mjs";

const latest = findLatestCvRun();
if (!latest) {
  console.log("No continuous-verification.json found. Run npm run cv:run first.");
  process.exit(0);
}
const payload = JSON.parse(fs.readFileSync(latest.path, "utf8"));
const paths = createCvPaths();
writeCvReport(payload, paths);
console.log(`Report refreshed: ${paths.files.reportHtmlLatest}`);
