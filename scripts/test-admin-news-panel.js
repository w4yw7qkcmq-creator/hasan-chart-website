#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const adminNewsPanelPath = path.join(repoRoot, "app/(app)/admin/news/AdminNewsPanel.js");
const statusPanelPath = path.join(repoRoot, "app/(app)/admin/news/NewsSystemStatusPanel.js");
const statusHookPath = path.join(repoRoot, "app/(app)/admin/news/useNewsSystemStatus.js");
const boundaryPath = path.join(repoRoot, "app/(app)/admin/news/NewsSystemStatusPanelBoundary.js");

const adminNewsPanelSource = fs.readFileSync(adminNewsPanelPath, "utf8");
const statusPanelSource = fs.readFileSync(statusPanelPath, "utf8");
const statusHookSource = fs.readFileSync(statusHookPath, "utf8");
const boundarySource = fs.readFileSync(boundaryPath, "utf8");

assert.match(
  adminNewsPanelSource,
  /import\s+\{\s*IAM_PERMISSIONS\s*\}\s+from\s+["'][^"']*lib\/iam\/constants["']/,
  "AdminNewsPanel must import IAM_PERMISSIONS"
);

assert.match(adminNewsPanelSource, /NewsSystemStatusPanelBoundary/);
assert.match(adminNewsPanelSource, /<NewsSystemStatusPanelBoundary>/);
assert.match(adminNewsPanelSource, /IAM_PERMISSIONS\.NEWS_READ/);
assert.match(adminNewsPanelSource, /IAM_PERMISSIONS\.NEWS_PUBLISH/);
assert.match(adminNewsPanelSource, /admin-news-page__hero/);
assert.match(adminNewsPanelSource, /admin-news-page__hero-title/);
assert.match(adminNewsPanelSource, /admin-news-page__hero-back/);
assert.match(adminNewsPanelSource, /مركز مراقبة وإدارة نظام الأخبار/);
assert.doesNotMatch(adminNewsPanelSource, /admin-standalone-back-link/);

assert.match(statusHookSource, /بيانات المراقبة غير متاحة مؤقتًا/);
assert.match(statusPanelSource, /filterProductionSources/);
assert.match(statusPanelSource, /filterProductionIncidents/);
assert.match(statusPanelSource, /useNewsSystemStatus/);
assert.doesNotMatch(statusPanelSource, />[\s]*تحديث[\s]*</);
assert.match(statusPanelSource, /formatGregorianDateTime/);

assert.match(boundarySource, /getDerivedStateFromError/);
assert.match(boundarySource, /بيانات المراقبة غير متاحة مؤقتًا/);

console.log("test-admin-news-panel.js: PASS");
