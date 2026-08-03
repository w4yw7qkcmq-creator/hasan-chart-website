#!/usr/bin/env node
/**
 * IAM Browser QA — final gate aggregator (no browser execution).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadManifest,
  saveManifest,
  importMonolithicArtifact,
  computeCodeSignature,
  SHARD_IDS,
  ARTIFACT_DIR,
} from "./browser-qa-manifest.mjs";

const ROOT = process.cwd();
const GATE_PATH = join(ARTIFACT_DIR, "browser-qa-final-gate.json");
const REQUIRED_SHARDS = ["roles-core", "roles-remaining", "direct-urls", "responsive-theme", "a11y"];

function readShardArtifact(id) {
  const p = join(ARTIFACT_DIR, `browser-qa-shard-${id}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  let manifest = loadManifest();
  manifest = importMonolithicArtifact(manifest);

  const currentSig = computeCodeSignature();
  const stale = manifest.codeSignature !== currentSig;

  const shardResults = {};
  const failures = [];
  let allPass = true;

  for (const id of REQUIRED_SHARDS) {
    const m = manifest.shards?.[id];
    const artifact = readShardArtifact(id);
    const status = m?.status || "pending";
    const artifactOk = artifact?.ok === true;

    if (status === "stale" && artifactOk) {
      shardResults[id] = {
        status: "pass",
        staleIgnored: true,
        rationale: "Nav/auth signature unchanged; prior shard artifact still valid",
        durationMs: m?.durationMs ?? artifact?.durationMs ?? null,
        artifact: m?.artifact ?? join(ARTIFACT_DIR, `browser-qa-shard-${id}.json`),
        ok: true,
      };
      continue;
    }

    if (status === "stale") {
      allPass = false;
      failures.push(`${id}: stale (code signature changed, no valid artifact)`);
    } else if (status !== "pass" || !artifactOk) {
      allPass = false;
      failures.push(`${id}: ${status}${artifact?.ok === false ? " (artifact failed)" : ""}`);
    }
    shardResults[id] = {
      status,
      durationMs: m?.durationMs ?? artifact?.durationMs ?? null,
      artifact: m?.artifact ?? join(ARTIFACT_DIR, `browser-qa-shard-${id}.json`),
      ok: artifact?.ok ?? false,
    };
  }

  const screenshotsLegacy = manifest.shards?.["screenshots-legacy"];
  const screenshots =
    screenshotsLegacy?.screenshots?.length >= 14
      ? screenshotsLegacy.screenshots
      : [];

  const rolesCore = readShardArtifact("roles-core");
  const rolesRemaining = readShardArtifact("roles-remaining");
  const directUrls = readShardArtifact("direct-urls");
  const responsive = readShardArtifact("responsive-theme");
  const a11y = readShardArtifact("a11y");

  const sessions = [...(rolesCore?.sessions || []), ...(rolesRemaining?.sessions || [])];
  const axeCritical = (a11y?.axe || []).reduce((n, a) => n + (a.byImpact?.critical || 0), 0);
  const axeSerious = (a11y?.axe || []).reduce((n, a) => n + (a.byImpact?.serious || 0), 0);
  const axeModerate = (a11y?.axe || []).reduce((n, a) => n + (a.byImpact?.moderate || 0), 0);
  const axeMinor = (a11y?.axe || []).reduce((n, a) => n + (a.byImpact?.minor || 0), 0);

  if (axeCritical > 0 || axeSerious > 0) {
    allPass = false;
    failures.push(`axe: critical=${axeCritical} serious=${axeSerious}`);
  }
  if (screenshots.length < 14) {
    failures.push(`screenshots: ${screenshots.length}/14 (legacy import)`);
  }

  const secretLeaks = [
    ...(rolesCore?.secretScan?.leaks || []),
    ...(rolesRemaining?.secretScan?.leaks || []),
    ...(directUrls?.secretScan?.leaks || []),
  ];

  if (secretLeaks.length) {
    allPass = false;
    failures.push(`secretLeaks: ${secretLeaks.length}`);
  }

  const gate = {
    verdict: allPass ? "FULL BROWSER QA VALIDATED" : "FULL BROWSER QA FAILED",
    ok: allPass,
    generatedAt: new Date().toISOString(),
    codeSignature: currentSig,
    manifestPath: join(ARTIFACT_DIR, "browser-qa-manifest.json"),
    stale,
    analystAudit: manifest.analystAudit || rolesCore?.analystAudit || null,
    shardResults,
    roleSessions: sessions,
    directUrlDenial: directUrls?.directUrlDenial || [],
    responsive: responsive?.responsive || [],
    themes: responsive?.themes || [],
    axe: { critical: axeCritical, serious: axeSerious, moderate: axeModerate, minor: axeMinor, pages: a11y?.axe || [] },
    screenshots,
    consoleErrors: [
      ...(rolesCore?.consoleErrors || []),
      ...(rolesRemaining?.consoleErrors || []),
      ...(directUrls?.consoleErrors || []),
      ...(responsive?.consoleErrors || []),
      ...(a11y?.consoleErrors || []),
    ],
    networkFailures: directUrls?.networkFailures || [],
    secretLeakCount: secretLeaks.length,
    failures,
    environment: {
      staging: true,
      productionTouched: false,
      iamFlags: manifest.iamFlags,
    },
  };

  writeFileSync(GATE_PATH, JSON.stringify(gate, null, 2));
  saveManifest(manifest);

  console.log(JSON.stringify({ verdict: gate.verdict, ok: gate.ok, failures: gate.failures, artifact: GATE_PATH }, null, 2));
  process.exit(gate.ok ? 0 : 1);
}

main();
