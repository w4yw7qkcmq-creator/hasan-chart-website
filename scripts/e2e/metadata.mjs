import { execSync } from "node:child_process";
import os from "node:os";

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function collectRunMetadata({ baseUrl, environment, browser = "chromium", viewport = "1440x900" }) {
  const startedAt = new Date();
  return {
    gitCommit: safeExec("git rev-parse HEAD") || "unknown",
    gitBranch: safeExec("git rev-parse --abbrev-ref HEAD") || "unknown",
    environment: environment || "custom",
    baseUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    browser,
    viewport,
  };
}

export function finalizeMetadata(metadata) {
  const finishedAt = new Date();
  const started = new Date(metadata.startedAt).getTime();
  return {
    ...metadata,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - started,
  };
}
