#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

const VISUAL_IMPORTANT =
  /\b(background(?:-color|-image)?|color|border(?:-color|-width|-style)?|box-shadow|opacity|fill|stroke|gradient)\b[^;{]*!important/i;
const PRINT_IMPORTANT = /@media\s+print[\s\S]*?display\s*:\s*none\s*!important/i;
const MOTION_IMPORTANT =
  /@media\s*\(\s*prefers-reduced-motion[\s\S]*!important/gi;

function listCssFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) listCssFiles(abs, acc);
    else if (entry.name.endsWith(".css")) acc.push(abs);
  }
  return acc;
}

let totalImportant = 0;
let visualImportant = 0;
let printOnlyImportant = 0;
const visualViolations = [];

for (const abs of listCssFiles(APP)) {
  const rel = relative(ROOT, abs);
  const content = readFileSync(abs, "utf8");
  const lines = content.split("\n");
  let inPrintBlock = false;
  let inReducedMotionBlock = false;

  lines.forEach((line, index) => {
    if (!line.includes("!important")) return;

    if (/@media\s+print/.test(line)) inPrintBlock = true;
    if (/@media\s*\(\s*prefers-reduced-motion/.test(line)) inReducedMotionBlock = true;

    totalImportant += 1;

    const isPrintLine =
      inPrintBlock && /display\s*:\s*none\s*!important/.test(line);
    const isMotionLine =
      inReducedMotionBlock &&
      /(?:animation(?:-duration|-iteration-count)?|transition-duration)\s*:[^;]*!important/.test(
        line,
      );

    if (isPrintLine) {
      printOnlyImportant += 1;
      return;
    }

    if (isMotionLine) {
      return;
    }

    if (/important-allow/i.test(line)) return;

    if (VISUAL_IMPORTANT.test(line)) {
      visualImportant += 1;
      visualViolations.push(`${rel}:${index + 1}: ${line.trim()}`);
    }
  });

  if (/^\s*\}/.test(lines.at(-1) || "")) {
    inPrintBlock = false;
    inReducedMotionBlock = false;
  }
}

assert.equal(
  visualImportant,
  0,
  `visual !important must be 0\n${visualViolations.slice(0, 20).join("\n")}`,
);

console.log(
  `test-important-usage: PASS totalImportant=${totalImportant} visualImportant=${visualImportant} printOnlyImportant=${printOnlyImportant}`,
);
