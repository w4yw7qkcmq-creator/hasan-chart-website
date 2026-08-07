import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync("supabase/migrations/20260808_content_posts.sql", "utf8");

describe("content_posts RLS static", () => {
  it("enables RLS", () => {
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it("allows public read only for published non-deleted rows", () => {
    assert.match(migration, /status = 'published'/);
    assert.match(migration, /deleted_at IS NULL/);
  });

  it("does not grant direct authenticated writes", () => {
    assert.doesNotMatch(migration, /GRANT INSERT, UPDATE, DELETE ON TABLE public\.content_posts TO authenticated/);
    assert.match(migration, /GRANT ALL ON TABLE public\.content_posts TO service_role/);
  });

  it("uses soft delete column", () => {
    assert.match(migration, /deleted_at timestamptz/);
  });
});

console.log("content posts rls static tests loaded");
