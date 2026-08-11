#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateUserClassificationAdmin } from "../lib/user-classification-admin.js";

function createMockSupabase(state) {
  return {
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() {
          return this;
        },
        eq(_col, id) {
          this._id = id;
          return this;
        },
        maybeSingle: async () => ({
          data: state.profiles[this._id] || null,
          error: null,
        }),
        update(payload) {
          this._update = payload;
          return this;
        },
        then: undefined,
        selectAfter() {
          return this;
        },
      };
    },
  };
}

describe("updateUserClassificationAdmin", () => {
  it("denies self classification change", async () => {
    const supabase = {
      from() {
        throw new Error("should not reach DB");
      },
    };
    await assert.rejects(
      () =>
        updateUserClassificationAdmin(supabase, {
          adminUser: { id: "u1", email: "a@test.com" },
          targetUserId: "u1",
          classification: "test",
        }),
      (error) => error.status === 403
    );
  });
});

console.log("user classification admin tests loaded");
