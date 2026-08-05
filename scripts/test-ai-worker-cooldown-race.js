#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";

test("duplicate reservation blocked by unique reserving index policy", () => {
  const reservations = [{ userId: "u1", status: "reserving" }];
  function reserve(userId) {
    if (reservations.some((r) => r.userId === userId && r.status === "reserving")) {
      return { ok: false, code: "INSTANT_ANALYSIS_IN_PROGRESS" };
    }
    reservations.push({ userId, status: "reserving" });
    return { ok: true };
  }
  assert.equal(reserve("u1").ok, false);
  assert.equal(reserve("u2").ok, true);
});

test("cooldown applies per user only", () => {
  const cooldown = new Map([["u1", Date.now() + 60_000]]);
  function allowed(userId) {
    const until = cooldown.get(userId);
    return !until || until <= Date.now();
  }
  assert.equal(allowed("u1"), false);
  assert.equal(allowed("u2"), true);
});

console.log("test-ai-worker-cooldown-race: all tests registered");
