#!/usr/bin/env node
/**
 * Production content-images orphan cleanup — dry-run by default.
 *
 * Usage:
 *   node scripts/content-posts-production-storage-cleanup.mjs
 *   node scripts/content-posts-production-storage-cleanup.mjs --execute --confirm-production-cleanup
 *   node scripts/content-posts-production-storage-cleanup.mjs --max-delete=200
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../lib/production-env-guard.js";

export const DEFAULT_MAX_DELETE = 500;
export const CONTENT_IMAGE_ROOTS = Object.freeze(["academy", "result"]);

export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

export function parseCleanupArgs(argv = process.argv.slice(2)) {
  const maxMatch = argv.find((arg) => arg.startsWith("--max-delete="));
  const maxDelete = maxMatch ? Number(maxMatch.split("=")[1]) : DEFAULT_MAX_DELETE;
  return {
    execute: argv.includes("--execute"),
    confirmProductionCleanup: argv.includes("--confirm-production-cleanup"),
    maxDelete: Number.isFinite(maxDelete) && maxDelete > 0 ? maxDelete : DEFAULT_MAX_DELETE,
  };
}

export function resolveDeletionMode(flags) {
  if (flags.execute && flags.confirmProductionCleanup) {
    return { mode: "execute", wouldDelete: true };
  }
  return {
    mode: "dry-run",
    wouldDelete: false,
    reason:
      flags.execute && !flags.confirmProductionCleanup
        ? "missing_confirm_production_cleanup"
        : !flags.execute && flags.confirmProductionCleanup
          ? "missing_execute"
          : "default_dry_run",
  };
}

export function loadVerifiedProductionEnv(root = process.cwd(), envOverride = null) {
  const env =
    envOverride ||
    parseEnvFile(resolve(root, ".env.local"));
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !serviceRoleKey) {
    const error = new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    error.code = "MISSING_ENV";
    throw error;
  }

  const verified = assertProductionSupabaseConfig({ url });
  const ref = verified.projectRef || extractSupabaseProjectRef(url);
  if (ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(
      `Production identity mismatch: expected ${maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF)}, got ${maskProjectRef(ref)}`
    );
    error.code = "NOT_PRODUCTION_REF";
    throw error;
  }

  return { url, serviceRoleKey, projectRef: ref };
}

export function maskStoragePath(path) {
  const parts = String(path || "").split("/");
  if (parts.length >= 2) {
    parts[1] = `${parts[1].slice(0, 4)}***`;
  }
  return parts.join("/");
}

export function assertOrphanCountWithinBounds(count, maxDelete = DEFAULT_MAX_DELETE) {
  if (count > maxDelete) {
    const error = new Error(
      `Orphan candidate count ${count} exceeds safety ceiling ${maxDelete}. Refusing cleanup.`
    );
    error.code = "ORPHAN_CEILING_EXCEEDED";
    throw error;
  }
}

export function isBenignRemoveError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("not found") || message.includes("object not found");
}

async function listAllObjects(admin, prefix) {
  const { data, error } = await admin.storage.from("content-images").list(prefix, { limit: 1000 });
  if (error) throw error;
  const objects = [];
  for (const item of data || []) {
    if (item.id === null) {
      objects.push(...(await listAllObjects(admin, `${prefix}/${item.name}`)));
    } else {
      objects.push(`${prefix}/${item.name}`);
    }
  }
  return objects;
}

async function collectOrphans(admin) {
  const { data: posts, error } = await admin.from("content_posts").select("image_path");
  if (error) throw error;
  const refs = new Set((posts || []).map((p) => p.image_path).filter(Boolean));
  const objects = [];
  for (const root of CONTENT_IMAGE_ROOTS) {
    objects.push(...(await listAllObjects(admin, root)));
  }
  return objects.filter((path) => !refs.has(path));
}

async function removeOrphans(admin, orphans) {
  const deleted = [];
  const skipped = [];
  for (const path of orphans) {
    const { error } = await admin.storage.from("content-images").remove([path]);
    if (error) {
      if (isBenignRemoveError(error)) {
        skipped.push({ path: maskStoragePath(path), reason: "already_missing" });
        continue;
      }
      throw error;
    }
    deleted.push(maskStoragePath(path));
  }
  return { deleted, skipped };
}

export async function runContentPostsStorageCleanup(options = {}) {
  const flags = options.flags || parseCleanupArgs(options.argv || []);
  const root = options.root || process.cwd();
  const mode = resolveDeletionMode(flags);
  const env = loadVerifiedProductionEnv(root);
  const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });

  const orphans = await collectOrphans(admin);
  assertOrphanCountWithinBounds(orphans.length, flags.maxDelete);

  const report = {
    mode: mode.mode,
    wouldDelete: mode.wouldDelete,
    reason: mode.reason || null,
    projectRef: maskProjectRef(env.projectRef),
    orphanCandidates: orphans.length,
    sample: orphans.slice(0, 10).map(maskStoragePath),
    deleted: [],
    skipped: [],
    orphansAfter: null,
  };

  if (!mode.wouldDelete) {
    return report;
  }

  const result = await removeOrphans(admin, orphans);
  report.deleted = result.deleted;
  report.skipped = result.skipped;

  const after = [];
  for (const rootPrefix of CONTENT_IMAGE_ROOTS) {
    after.push(...(await listAllObjects(admin, rootPrefix)));
  }
  const { data: postsAfter } = await admin.from("content_posts").select("image_path");
  const refsAfter = new Set((postsAfter || []).map((p) => p.image_path).filter(Boolean));
  report.orphansAfter = after.filter((path) => !refsAfter.has(path)).length;

  return report;
}

async function main() {
  const report = await runContentPostsStorageCleanup();
  console.log(JSON.stringify(report, null, 2));
  if (report.mode === "dry-run") {
    process.exitCode = 0;
    return;
  }
  process.exitCode = 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.code || "cleanup_failed", message: error.message }, null, 2));
    process.exit(1);
  });
}
