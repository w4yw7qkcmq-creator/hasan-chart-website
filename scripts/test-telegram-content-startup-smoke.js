#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const instrumentation = readFileSync(join(process.cwd(), "instrumentation.js"), "utf8");
const scheduler = readFileSync(
  join(process.cwd(), "lib/telegram-content/album-liveness-scheduler.js"),
  "utf8"
);

assert.match(instrumentation, /process\.env\.NEXT_RUNTIME === "nodejs"/);
assert.match(instrumentation, /recoverTelegramAlbumTimersOnStartup/);
assert.doesNotMatch(scheduler, /setInterval\(/);
assert.match(scheduler, /recoverTelegramAlbumTimersOnStartup/);
assert.match(scheduler, /scheduleAlbumGroupFinalization/);

console.log("test-telegram-content-startup-smoke: PASS");
