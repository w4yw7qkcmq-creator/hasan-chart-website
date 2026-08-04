/**
 * Browser QA resume manifest — tracks shard status and code signature staleness.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
export const MANIFEST_PATH = join(ROOT, "scripts/iam/.artifacts/browser-qa-manifest.json");
export const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");

export const SHARD_IDS = [
  "roles-core",
  "roles-remaining",
  "direct-urls",
  "responsive-theme",
  "a11y",
  "screenshots-legacy",
];

/** Files that invalidate browser nav/auth shards when changed. */
export const SIGNATURE_FILES = [
  "app/(app)/admin/components/admin-hub-config.js",
  "app/(app)/admin/components/AdminHubNavigation.js",
  "app/components/AdminAccessGate.js",
  "app/components/AuthProvider.js",
  "lib/admin-auth-guard.js",
  "lib/iam/require-admin-session.js",
  "lib/iam/resolve-permissions.js",
  "lib/iam/machine-auth.js",
  "lib/iam/service-identities.js",
  "lib/iam/assignment-enforcement.js",
  "scripts/iam/browser-qa-harness.mjs",
];

export function computeCodeSignature(root = ROOT) {
  const hash = createHash("sha256");
  for (const rel of SIGNATURE_FILES) {
    const p = resolve(root, rel);
    if (existsSync(p)) hash.update(readFileSync(p));
  }
  return hash.digest("hex").slice(0, 16);
}

export function defaultManifest(envMeta = {}) {
  const now = new Date().toISOString();
  const shards = {};
  for (const id of SHARD_IDS) {
    shards[id] = {
      status: "pending",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      artifact: join(ARTIFACT_DIR, `browser-qa-shard-${id}.json`),
      screenshots: [],
      failedAssertions: [],
      secretLeakCount: 0,
      processCleanup: { orphans: [] },
    };
  }
  return {
    version: 1,
    environment: "staging",
    codeSignature: computeCodeSignature(),
    iamFlags: { IAM_DB: true, IAM_API: true, IAM_UI: true, IAM_RLS: false },
    stagingRef: envMeta.stagingRef || null,
    productionRef: envMeta.productionRef || null,
    updatedAt: now,
    analystAudit: null,
    shards,
  };
}

export function loadManifest(envMeta = {}) {
  if (!existsSync(MANIFEST_PATH)) return defaultManifest(envMeta);
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    const sig = computeCodeSignature();
    if (m.codeSignature !== sig) {
      for (const id of SHARD_IDS) {
        if (m.shards?.[id]?.status === "pass") {
          m.shards[id].status = "stale";
        }
      }
      m.codeSignature = sig;
    }
    return m;
  } catch {
    return defaultManifest(envMeta);
  }
}

export function saveManifest(manifest) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function markShard(manifest, shardId, patch) {
  manifest.shards[shardId] = { ...manifest.shards[shardId], ...patch };
  saveManifest(manifest);
}

export function importMonolithicArtifact(manifest) {
  const monoPath = join(ARTIFACT_DIR, "staging-browser-qa.json");
  if (!existsSync(monoPath)) return manifest;
  try {
    const mono = JSON.parse(readFileSync(monoPath, "utf8"));
    const passedRoles = (mono.sessions || []).filter((s) => s.pass).map((s) => s.role);
    manifest.monolithicImport = {
      at: mono.startedAt,
      durationMs: mono.durationMs,
      passedRoles,
      screenshots: mono.screenshots || [],
      aborted: mono.aborted || false,
    };
    if ((mono.screenshots || []).length >= 14) {
      manifest.shards["screenshots-legacy"] = {
        ...manifest.shards["screenshots-legacy"],
        status: "pass",
        finishedAt: mono.startedAt,
        durationMs: 0,
        screenshots: mono.screenshots,
        note: "Imported from monolithic run — not re-captured",
      };
    }
  } catch {
    /* ignore */
  }
  return manifest;
}
