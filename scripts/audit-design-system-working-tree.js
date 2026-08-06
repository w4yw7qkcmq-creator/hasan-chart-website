#!/usr/bin/env node
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EXCLUDE_PREFIXES = ["tmp-", "screenshots/", "artifacts/", "supabase/.temp"];
const EXCLUDE_GLOBS = [
  /^performance-/,
  /^iam-soak/,
  /\.png$/,
  /\.jpg$/,
  /\.webp$/,
  /local-auth/,
  /browser-storage/,
];

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
}

const status = run("git status --porcelain");
const lines = status.split("\n").filter(Boolean);

const modified = [];
const untracked = [];

for (const line of lines) {
  const code = line.slice(0, 2);
  const file = line.slice(3);
  if (code.includes("?")) untracked.push(file);
  else modified.push(file);
}

function classify(file) {
  if (EXCLUDE_PREFIXES.some((p) => file.startsWith(p) || file.includes(`/${p}`))) {
    return { bucket: "F", keep: "Exclude", reason: "temp/artifact" };
  }
  if (EXCLUDE_GLOBS.some((re) => re.test(file))) {
    return { bucket: "F", keep: "Exclude", reason: "generated/artifact" };
  }
  if (file.startsWith("app/components/ui/") || file === "app/components/ui/ui-theme.js") {
    return { bucket: "A", keep: "Keep", reason: "design system foundation" };
  }
  if (file.startsWith("app/design-system-fixture/")) {
    return { bucket: "D", keep: "Keep", reason: "runtime fixture" };
  }
  if (file.startsWith("scripts/test-") || file.startsWith("scripts/lib/design-system")) {
    return { bucket: "D", keep: "Keep", reason: "design system tests" };
  }
  if (file.includes("admin-theme") || file.includes("globals.css") || file.includes("ui-theme")) {
    return { bucket: "A", keep: "Keep", reason: "theme foundation" };
  }
  if (file.startsWith("app/(app)/admin/") || file.includes("Admin")) {
    return { bucket: "C", keep: "Keep", reason: "legacy visual migration admin" };
  }
  if (file.startsWith("app/") && /\.(js|jsx|tsx|css)$/.test(file)) {
    return { bucket: "C", keep: "Keep", reason: "legacy visual migration app" };
  }
  if (file.startsWith("docs/") || file.endsWith(".md")) {
    return { bucket: "E", keep: "Investigate", reason: "documentation" };
  }
  if (file.startsWith("app/api/") || file.startsWith("supabase/migrations")) {
    return { bucket: "H", keep: "Investigate", reason: "unexpected logic/migration change" };
  }
  return { bucket: "G", keep: "Investigate", reason: "unrelated or unclear" };
}

const rows = [];
let workingTreeUnexpectedFiles = 0;

for (const file of [...modified, ...untracked]) {
  const { bucket, keep, reason } = classify(file);
  if (bucket === "G" || bucket === "H") workingTreeUnexpectedFiles += 1;
  rows.push({ file, bucket, keep, reason });
}

console.log("File | Bucket | Keep/Exclude | Reason");
for (const row of rows.slice(0, 200)) {
  console.log(`${row.file} | ${row.bucket} | ${row.keep} | ${row.reason}`);
}
if (rows.length > 200) console.log(`... ${rows.length - 200} more rows`);

console.log("\nSummary:");
console.log(`modified=${modified.length}`);
console.log(`untracked=${untracked.length}`);
console.log(`workingTreeUnexpectedFiles=${workingTreeUnexpectedFiles}`);

const reportPath = join(ROOT, "tmp-design-system-working-tree-audit.txt");
try {
  writeFileSync(
    reportPath,
    rows.map((r) => `${r.file}\t${r.bucket}\t${r.keep}\t${r.reason}`).join("\n"),
  );
  console.log(`full audit written: ${reportPath}`);
} catch {
  // ignore
}

process.exit(0);
