#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  assertProductionSupabaseConfig,
} from "../lib/production-env-guard.js";
import {
  DEFAULT_MAX_DELETE,
  assertOrphanCountWithinBounds,
  isBenignRemoveError,
  loadVerifiedProductionEnv,
  maskStoragePath,
  parseCleanupArgs,
  resolveDeletionMode,
} from "./content-posts-production-storage-cleanup.mjs";

describe("content posts storage cleanup guards", () => {
  it("default argv is dry-run", () => {
    const flags = parseCleanupArgs([]);
    const mode = resolveDeletionMode(flags);
    assert.equal(mode.mode, "dry-run");
    assert.equal(mode.wouldDelete, false);
  });

  it("--execute alone does not allow deletion", () => {
    const flags = parseCleanupArgs(["--execute"]);
    const mode = resolveDeletionMode(flags);
    assert.equal(mode.wouldDelete, false);
    assert.equal(mode.reason, "missing_confirm_production_cleanup");
  });

  it("--confirm-production-cleanup alone does not allow deletion", () => {
    const flags = parseCleanupArgs(["--confirm-production-cleanup"]);
    const mode = resolveDeletionMode(flags);
    assert.equal(mode.wouldDelete, false);
    assert.equal(mode.reason, "missing_execute");
  });

  it("both execute flags make deletion eligible without live delete", () => {
    const flags = parseCleanupArgs(["--execute", "--confirm-production-cleanup"]);
    const mode = resolveDeletionMode(flags);
    assert.equal(mode.mode, "execute");
    assert.equal(mode.wouldDelete, true);
  });

  it("blocks staging project ref", () => {
    assert.throws(
      () =>
        assertProductionSupabaseConfig({
          url: `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`,
        }),
      (error) => error.code === "STAGING_REF_REJECTED"
    );
  });

  it("blocks wrong project ref", () => {
    assert.throws(
      () =>
        assertProductionSupabaseConfig({
          url: "https://wrongref123456.supabase.co",
        }),
      (error) => error.code === "UNKNOWN_SUPABASE_REF"
    );
  });

  it("blocks missing identity env", () => {
    assert.throws(
      () => loadVerifiedProductionEnv(process.cwd(), {}),
      (error) => error.code === "MISSING_ENV"
    );
  });

  it("accepts verified production ref", () => {
    const env = loadVerifiedProductionEnv(process.cwd(), {
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    });
    assert.equal(env.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
  });

  it("enforces orphan ceiling", () => {
    assert.doesNotThrow(() => assertOrphanCountWithinBounds(10, DEFAULT_MAX_DELETE));
    assert.throws(
      () => assertOrphanCountWithinBounds(DEFAULT_MAX_DELETE + 1, DEFAULT_MAX_DELETE),
      (error) => error.code === "ORPHAN_CEILING_EXCEEDED"
    );
  });

  it("masks storage paths", () => {
    assert.match(maskStoragePath("academy/abcdef123456/file.png"), /academy\/abcd\*\*\*/);
  });

  it("treats missing-object remove errors as benign", () => {
    assert.equal(isBenignRemoveError(new Error("Object not found")), true);
    assert.equal(isBenignRemoveError(new Error("fatal")), false);
  });
});

console.log("content posts storage cleanup safety tests passed");
