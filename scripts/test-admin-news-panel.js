#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const adminNewsPanelPath = path.join(repoRoot, "app/(app)/admin/news/AdminNewsPanel.js");
const statusPanelPath = path.join(repoRoot, "app/(app)/admin/news/NewsSystemStatusPanel.js");
const boundaryPath = path.join(repoRoot, "app/(app)/admin/news/NewsSystemStatusPanelBoundary.js");

const adminNewsPanelSource = fs.readFileSync(adminNewsPanelPath, "utf8");
const statusPanelSource = fs.readFileSync(statusPanelPath, "utf8");
const boundarySource = fs.readFileSync(boundaryPath, "utf8");

assert.match(
  adminNewsPanelSource,
  /import\s+\{\s*IAM_PERMISSIONS\s*\}\s+from\s+["'][^"']*lib\/iam\/constants["']/,
  "AdminNewsPanel must import IAM_PERMISSIONS"
);

assert.match(adminNewsPanelSource, /IAM_PERMISSIONS\.NEWS_READ/);
assert.match(adminNewsPanelSource, /IAM_PERMISSIONS\.NEWS_PUBLISH/);
assert.match(adminNewsPanelSource, /NewsSystemStatusPanelBoundary/);
assert.match(adminNewsPanelSource, /<NewsSystemStatusPanelBoundary>/);

assert.match(statusPanelSource, /بيانات المراقبة غير متاحة مؤقتًا/);
assert.match(statusPanelSource, /sources\.length/);
assert.match(statusPanelSource, /incidents\.length/);
assert.match(statusPanelSource, /parseSuccessRate != null/);

assert.match(boundarySource, /getDerivedStateFromError/);
assert.match(boundarySource, /بيانات المراقبة غير متاحة مؤقتًا/);

console.log("test-admin-news-panel.js: PASS");
