#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { permissionForRoute } from "../lib/iam/route-permissions.js";
import { deriveOverallHealth } from "../lib/news-system-status/read-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const routePath = path.join(repoRoot, "app/api/admin/news/system-status/route.js");
const routeSource = fs.readFileSync(routePath, "utf8");

assert.equal(
  permissionForRoute("GET", "/api/admin/news/system-status"),
  IAM_PERMISSIONS.NEWS_READ
);

assert.match(routeSource, /requireAdminPermission\(IAM_PERMISSIONS\.NEWS_READ/);
assert.match(routeSource, /getNewsSystemStatusFromDb/);
assert.match(routeSource, /buildDailyOperationalSummaryFromDb/);
assert.doesNotMatch(routeSource, /getNewsSystemStatus\s*\(/);
assert.doesNotMatch(routeSource, /diagnostic-service/);

assert.equal(
  deriveOverallHealth({
    openIncidents: [{ severity: "CRITICAL" }],
    sources: [{ state: "HEALTHY" }],
  }),
  "CRITICAL"
);

assert.equal(
  deriveOverallHealth({
    openIncidents: [],
    sources: [{ state: "QUARANTINED" }],
  }),
  "DEGRADED"
);

console.log("test-news-system-status-api.js: PASS");
