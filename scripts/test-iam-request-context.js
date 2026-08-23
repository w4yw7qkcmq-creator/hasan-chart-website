#!/usr/bin/env node
/**
 * IAM Phase 1 — request-scoped context unit tests (no Next.js runtime required).
 * Run: node scripts/test-iam-request-context.js
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  adminSessionCacheKey,
  getRequestIamStore,
  getRequestSupabaseAdmin,
  iamContextCacheKey,
  memoizeRequestPromise,
  runWithRequestIamContext,
  __clearRequestIamStoresForTests,
} from "../lib/iam/request-context.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

__clearRequestIamStoresForTests();

test("iamContextCacheKey isolates user and organization", () => {
  const a = iamContextCacheKey("user-a", "org-1");
  const b = iamContextCacheKey("user-b", "org-1");
  const c = iamContextCacheKey("user-a", "org-2");
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("adminSessionCacheKey distinguishes touchSession flag", () => {
  const touch = adminSessionCacheKey({ organizationId: "default", touchSession: true });
  const noTouch = adminSessionCacheKey({ organizationId: "default", touchSession: false });
  assert.notEqual(touch, noTouch);
});

testAsync("memoizeRequestPromise executes factory once under concurrency", async () => {
  await runWithRequestIamContext(async () => {
    const store = await getRequestIamStore();
    let calls = 0;
    const factory = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, value: calls };
    };

    const [a, b, c] = await Promise.all([
      memoizeRequestPromise(store, store.adminSessionPromises, "k1", factory),
      memoizeRequestPromise(store, store.adminSessionPromises, "k1", factory),
      memoizeRequestPromise(store, store.adminSessionPromises, "k1", factory),
    ]);

    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  });
});

testAsync("AsyncLocalStorage isolates parallel request contexts", async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      runWithRequestIamContext(async () => {
        const store = await getRequestIamStore();
        store.bucket = index;
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        return store.bucket;
      })
    )
  );

  results.forEach((value, index) => {
    assert.equal(value, index);
  });
});

testAsync("failed promise is memoized within request (no duplicate external work)", async () => {
  await runWithRequestIamContext(async () => {
    const store = await getRequestIamStore();
    let calls = 0;
    const map = new Map();
    const factory = async () => {
      calls += 1;
      throw new Error("auth_failed");
    };

    await Promise.allSettled([
      memoizeRequestPromise(store, map, "fail", factory),
      memoizeRequestPromise(store, map, "fail", factory),
    ]);

    assert.equal(calls, 1);
  });
});

testAsync("supabase admin client reused within same request context", async () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUsImV4cCI6OTk5OTk5OTk5OX0.test";

  try {
    await runWithRequestIamContext(async () => {
      const a = await getRequestSupabaseAdmin();
      const b = await getRequestSupabaseAdmin();
      assert.equal(a, b);
    });
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});

console.log("Done.");
