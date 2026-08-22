#!/usr/bin/env node
/**
 * Migrate sync params/searchParams to Next 15 async form in server files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SERVER_PAGE_FILES = [
  "app/(public)/news/tag/[tag]/page.js",
  "app/(public)/news/[id]/page.js",
  "app/(public)/news/category/[category]/page.js",
  "app/(app)/results/[slug]/page.js",
  "app/(app)/academy/[slug]/page.js",
  "app/(app)/forbidden/page.js",
];

const ROUTE_FILES = [
  "app/api/admin/email-analytics/[id]/route.js",
  "app/api/partner/growth/smart-links/[id]/route.js",
  "app/api/admin/partner-withdrawals/[id]/approve/route.js",
  "app/api/admin/partner-withdrawals/[id]/reject/route.js",
  "app/api/admin/partner-withdrawals/[id]/mark-paid/route.js",
  "app/api/admin/partners/[id]/route.js",
  "app/api/admin/financial-center/payment-proof/[requestId]/route.js",
  "app/api/alerts/[id]/route.js",
  "app/api/admin/vip-recommendations/[id]/status-update/retry/route.js",
  "app/api/admin/vip-recommendations/[id]/status-update/route.js",
  "app/(app)/r/[code]/route.js",
];

function migrateServerPageParams(source) {
  if (source.includes("await params")) return source;

  return source.replace(
    /export async function (generateMetadata)\(\{ params \}\) \{\n/g,
    "export async function $1({ params }) {\n  const resolvedParams = await params;\n"
  ).replace(
    /export default async function (\w+)\(\{ params \}\) \{\n/g,
    "export default async function $1({ params }) {\n  const resolvedParams = await params;\n"
  ).replace(/\bparams\./g, "resolvedParams.").replace(/\bparams\?/g, "resolvedParams?");
}

function migrateForbiddenSearchParams(source) {
  if (source.includes("await searchParams")) return source;

  return source
    .replace(
      "export default function ForbiddenPage({ searchParams }) {",
      "export default async function ForbiddenPage({ searchParams }) {\n  const resolvedSearchParams = await searchParams;"
    )
    .replace(/\bsearchParams\?\./g, "resolvedSearchParams?.")
    .replace(/\bsearchParams\./g, "resolvedSearchParams.");
}

function migrateRouteParams(source) {
  if (source.includes("await params") && !source.match(/export async function \w+\([^)]*\{ params \}\)/)) {
    // may already be partially migrated
  }

  let out = source;
  const handlerPattern = /export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(([^)]*\{ params \}[^)]*)\) \{/g;
  out = out.replace(handlerPattern, (match, method, args) => {
    return `export async function ${method}(${args}) {\n  const resolvedParams = await params;`;
  });
  out = out.replace(/\bparams\?\./g, "resolvedParams?.");
  out = out.replace(/\bparams\./g, "resolvedParams.");
  // Fix double-await if context.params already migrated
  out = out.replace(/const resolvedParams = await params;\n  const params = await context\.params;/g,
    "const params = await context.params;");
  return out;
}

let changed = 0;

for (const rel of SERVER_PAGE_FILES) {
  const file = path.join(ROOT, rel);
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  if (rel.includes("forbidden")) {
    source = migrateForbiddenSearchParams(source);
  } else {
    source = migrateServerPageParams(source);
  }
  if (source !== original) {
    fs.writeFileSync(file, source);
    changed += 1;
    console.log("migrated page", rel);
  }
}

for (const rel of ROUTE_FILES) {
  const file = path.join(ROOT, rel);
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  source = migrateRouteParams(source);
  if (source !== original) {
    fs.writeFileSync(file, source);
    changed += 1;
    console.log("migrated route", rel);
  }
}

console.log(`async params migration touched ${changed} files`);
