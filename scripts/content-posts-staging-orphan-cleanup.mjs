#!/usr/bin/env node
/**
 * Staging-only orphan cleanup for content-images canary objects.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
} from "../lib/staging-env-guard.js";

const CANARY_MARKERS = ["staging-app-closure", "staging-gate-canary"];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function maskPath(path) {
  const parts = String(path || "").split("/");
  if (parts.length >= 2) parts[1] = `${parts[1].slice(0, 4)}***${parts[1].slice(-4)}`;
  return parts.join("/");
}

async function listAllObjects(supabase, prefix) {
  const { data, error } = await supabase.storage.from("content-images").list(prefix, { limit: 1000 });
  if (error) throw error;
  const objects = [];
  for (const item of data || []) {
    if (item.id === null) {
      const nested = await listAllObjects(supabase, `${prefix}/${item.name}`);
      objects.push(...nested);
    } else {
      objects.push({
        path: `${prefix}/${item.name}`,
        created_at: item.created_at || item.updated_at || null,
      });
    }
  }
  return objects;
}

async function main() {
  const staging = parseEnvFile(resolve(process.cwd(), ".env.staging.local"));
  const ref = extractSupabaseProjectRef(staging.STAGING_SUPABASE_URL);
  if (ref !== STAGING_SUPABASE_PROJECT_REF) throw new Error(`Not staging ref: ${maskProjectRef(ref)}`);
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF) throw new Error("Production ref blocked");

  const admin = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: posts } = await admin.from("content_posts").select("id,image_path,title,deleted_at");
  const referenced = new Set((posts || []).map((p) => p.image_path).filter(Boolean));

  const objects = [];
  for (const root of ["academy", "result"]) {
    objects.push(...(await listAllObjects(admin, root)));
  }

  const orphans = objects.filter((o) => !referenced.has(o.path));
  const report = {
    stagingRef: maskProjectRef(ref),
    productionBlocked: ref !== PRODUCTION_SUPABASE_PROJECT_REF,
    totalObjects: objects.length,
    referencedCount: objects.length - orphans.length,
    orphansBefore: orphans.map((o) => ({ path: maskPath(o.path), created_at: o.created_at, referenced: false })),
    deleted: [],
    orphansAfter: 0,
  };

  for (const orphan of orphans) {
    const postIds = (posts || []).filter((p) => p.image_path === orphan.path).map((p) => p.id);
    if (postIds.length > 0) {
      console.error(JSON.stringify({ skipped: maskPath(orphan.path), reason: "referenced" }));
      continue;
    }
    const { error } = await admin.storage.from("content-images").remove([orphan.path]);
    if (error) throw error;
    report.deleted.push(maskPath(orphan.path));
  }

  const after = [];
  for (const root of ["academy", "result"]) {
    after.push(...(await listAllObjects(admin, root)));
  }
  const afterOrphans = after.filter((o) => !referenced.has(o.path));
  report.orphansAfter = afterOrphans.length;
  report.cleanupRemainingStorageObjects = afterOrphans.length;

  console.log(JSON.stringify(report, null, 2));
  if (report.orphansAfter > 0) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e.message }));
  process.exit(1);
});
