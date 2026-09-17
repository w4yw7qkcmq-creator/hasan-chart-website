#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { listManifestEntries, getPoolBaseDir, getWorkerMirrorBaseDir } = require("../worker/lib/news-images/general-prebuilt-artwork-manifest");

function mirrorGeneralPrebuiltArtwork(options = {}) {
  const webDir = getPoolBaseDir(options.webDir);
  const workerDir = getWorkerMirrorBaseDir(options.workerDir);
  const entries = listManifestEntries(webDir);
  let copied = 0;
  const missing = [];

  for (const entry of entries) {
    if (!fs.existsSync(entry.absolutePath)) {
      missing.push(entry.relativePath);
      continue;
    }
    const dest = path.join(workerDir, entry.relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(entry.absolutePath, dest);
    copied += 1;
  }

  return { copied, missing, expected: entries.length };
}

if (require.main === module) {
  const result = mirrorGeneralPrebuiltArtwork();
  console.log("GENERAL_PREBUILT_MIRROR", JSON.stringify(result, null, 2));
  if (result.missing.length) {
    process.exitCode = 1;
  }
}

module.exports = { mirrorGeneralPrebuiltArtwork };
