#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const revalidation = readFileSync(join(process.cwd(), "lib/telegram-content/revalidation.js"), "utf8");

assert.match(revalidation, /revalidateNextPaths/);
assert.match(revalidation, /revalidatePath\(path\)/);
assert.match(revalidation, /collectPathsToRevalidate/);
assert.match(revalidation, /\/academy/);
assert.match(revalidation, /\/results/);
assert.match(revalidation, /\/daily-analysis/);
assert.match(revalidation, /invalidateReadCache/);

console.log("test-telegram-content-revalidation: PASS");
