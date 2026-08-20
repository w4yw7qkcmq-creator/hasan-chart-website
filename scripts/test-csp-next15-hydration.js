#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildContentSecurityPolicy,
  buildStrictContentSecurityPolicy,
} from "../lib/security-headers.js";
import { CSP_STATIC_INLINE_SCRIPT_HASHES } from "../lib/csp-inline-script-hashes.js";

const enforced = buildContentSecurityPolicy();
const strict = buildStrictContentSecurityPolicy();
const enforcedScriptSrc = enforced.match(/script-src[^;]+/)[0];
const strictScriptSrc = strict.match(/script-src[^;]+/)[0];

assert.doesNotMatch(enforced, /unsafe-eval/);
assert.match(enforcedScriptSrc, /unsafe-inline/);
assert.doesNotMatch(strictScriptSrc, /unsafe-inline/);

// Enforced policy must not include static hashes (they disable unsafe-inline in browsers).
for (const hash of CSP_STATIC_INLINE_SCRIPT_HASHES) {
  const token = hash.slice(1, -1);
  assert.ok(!enforced.includes(token), `enforced CSP must not include hash: ${token}`);
  assert.ok(strict.includes(token), `strict CSP must include hash: ${token}`);
}

assert.match(enforced, /challenges\.cloudflare\.com/);
assert.match(enforced, /tradingview\.com/);
assert.ok(!enforcedScriptSrc.includes("*"), "script-src must not use wildcards");

console.log("csp next15 hydration tests passed");
