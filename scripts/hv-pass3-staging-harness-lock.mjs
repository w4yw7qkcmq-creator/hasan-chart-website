#!/usr/bin/env node
/**
 * Staging financial harness lock — one HV/R6/R7/R8/R9 run at a time.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./hv-abuse-pass2-lib.mjs";

const LOCK_PATH = join(ROOT, ".artifacts/hv-staging-harness.lock");
const STALE_MS = 3 * 60 * 60 * 1000;

export function readHarnessLock() {
  if (!existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return { raw: readFileSync(LOCK_PATH, "utf8") };
  }
}

export function acquireHarnessLock(label = "hv-staging-harness") {
  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  const existing = readHarnessLock();
  if (existing?.pid && existing?.startedAt) {
    const age = Date.now() - Date.parse(existing.startedAt);
    let holderAlive = true;
    try {
      process.kill(existing.pid, 0);
    } catch {
      holderAlive = false;
    }
    if (!holderAlive) {
      unlinkSync(LOCK_PATH);
    } else if (age < STALE_MS) {
      return { acquired: false, existing, reason: "lock_active" };
    }
  } else if (existing?.pid) {
    try {
      process.kill(existing.pid, 0);
    } catch {
      unlinkSync(LOCK_PATH);
    }
  }
  const payload = {
    pid: process.pid,
    label,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2));
  return { acquired: true, lock: payload, path: LOCK_PATH };
}

export function releaseHarnessLock(expectedPid = process.pid) {
  const existing = readHarnessLock();
  if (!existing) return { released: false, reason: "no_lock" };
  if (existing.pid && existing.pid !== expectedPid) {
    let holderAlive = false;
    try {
      process.kill(existing.pid, 0);
      holderAlive = true;
    } catch {
      holderAlive = false;
    }
    if (holderAlive) {
      return { released: false, reason: "pid_mismatch", existing };
    }
  }
  unlinkSync(LOCK_PATH);
  return { released: true, staleReleased: Boolean(existing.pid && existing.pid !== expectedPid) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || "status";
  if (cmd === "acquire") {
    console.log(JSON.stringify(acquireHarnessLock(process.argv[3] || "manual"), null, 2));
    process.exit(0);
  }
  if (cmd === "release") {
    console.log(JSON.stringify(releaseHarnessLock(), null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({ lock: readHarnessLock(), path: LOCK_PATH }, null, 2));
}
