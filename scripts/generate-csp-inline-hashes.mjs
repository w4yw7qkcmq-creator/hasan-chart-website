#!/usr/bin/env node
/**
 * Generates SHA-256 CSP hash sources for trusted static inline scripts.
 * Used by strict/report-only CSP — not the enforced Next 15 production policy.
 */
import crypto from "node:crypto";
import { THEME_COOKIE_BOOT_SCRIPT } from "../lib/theme-critical-styles.js";

function hashSource(source) {
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

const entries = [
  { id: "CSP_THEME_COOKIE_BOOT_HASH", source: THEME_COOKIE_BOOT_SCRIPT, purpose: "theme cookie boot" },
];

console.log("// Trusted static inline scripts for strict/report-only CSP");
for (const entry of entries) {
  console.log(`// ${entry.id}: ${entry.purpose}`);
  console.log(`${entry.id} = ${hashSource(entry.source)}`);
}
