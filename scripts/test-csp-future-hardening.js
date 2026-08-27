#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  buildContentSecurityPolicy,
  buildStrictContentSecurityPolicy,
} from "../lib/security-headers.js";
import {
  CSP_STATIC_INLINE_SCRIPT_HASHES,
  CSP_THEME_COOKIE_BOOT_HASH,
} from "../lib/csp-inline-script-hashes.js";
import { THEME_COOKIE_BOOT_SCRIPT } from "../lib/theme-critical-styles.js";

function expectedHash(source) {
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

assert.equal(CSP_THEME_COOKIE_BOOT_HASH, expectedHash(THEME_COOKIE_BOOT_SCRIPT));
assert.equal(CSP_STATIC_INLINE_SCRIPT_HASHES.length, 1);

const enforced = buildContentSecurityPolicy();
const strict = buildStrictContentSecurityPolicy();
const enforcedScriptSrc = enforced.match(/script-src[^;]+/)[0];
const strictScriptSrc = strict.match(/script-src[^;]+/)[0];

assert.doesNotMatch(enforced, /unsafe-eval/);
assert.match(enforcedScriptSrc, /unsafe-inline/);
assert.doesNotMatch(strictScriptSrc, /unsafe-inline/);

for (const hash of CSP_STATIC_INLINE_SCRIPT_HASHES) {
  const token = hash.slice(1, -1);
  assert.ok(!enforced.includes(token), `enforced CSP must not include hash: ${token}`);
  assert.ok(strict.includes(token), `strict CSP must include hash: ${token}`);
}

assert.match(enforced, /challenges\.cloudflare\.com/);
assert.match(enforced, /tradingview\.com/);
assert.doesNotMatch(enforced, /api\.openai\.com/);
assert.ok(!enforcedScriptSrc.includes("*"), "script-src must not use wildcards");

console.log("csp future hardening tests passed");
