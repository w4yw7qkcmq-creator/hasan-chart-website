#!/usr/bin/env node
import { loadManifest, assertManifestHash, validateManifestStructure } from "./backfill-unified-manifest.mjs";

const file = "scripts/partner-center/.artifacts/step3b-unified-backfill-manifest.json";
const manifest = loadManifest(file);
validateManifestStructure(manifest);

const hash = manifest.manifestSha256;
if (manifest.manifestSha256Expected !== hash) {
  console.error("FAIL: manifestSha256Expected mismatch");
  process.exit(1);
}
assertManifestHash(manifest, hash);

let threw = false;
try {
  assertManifestHash({ ...manifest, version: "tampered" }, hash);
} catch {
  threw = true;
}

if (!threw) {
  console.error("FAIL: expected hash mismatch abort");
  process.exit(1);
}

console.log("PASS manifest structure");
console.log("PASS manifest hash stable");
console.log("PASS manifest hash mismatch abort");
console.log(JSON.stringify({ manifestSha256: hash }, null, 2));
