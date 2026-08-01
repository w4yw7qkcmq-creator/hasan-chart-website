const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_CACHE_DIR = path.join(__dirname, "..", "..", ".cache", "news-images");

function buildCacheKey({ eventName, country, releaseTime }) {
  const bucket = releaseTime ? new Date(releaseTime).toISOString().slice(0, 13) : "unknown";
  return crypto
    .createHash("sha1")
    .update(`${String(country || "US").toUpperCase()}|${String(eventName || "").trim()}|${bucket}`)
    .digest("hex");
}

function getCachePaths(cacheKey, cacheDir = DEFAULT_CACHE_DIR) {
  const fileName = `${cacheKey}.png`;
  return {
    cacheDir,
    filePath: path.join(cacheDir, fileName),
    metaPath: path.join(cacheDir, `${cacheKey}.json`),
  };
}

function readCachedImage(context, options = {}) {
  const cacheKey = buildCacheKey(context);
  const { filePath, metaPath } = getCachePaths(cacheKey, options.cacheDir);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (_error) {
      meta = null;
    }
  }

  return {
    cacheKey,
    filePath,
    buffer: fs.readFileSync(filePath),
    meta,
    cached: true,
  };
}

function writeCachedImage(context, buffer, meta = {}, options = {}) {
  const cacheKey = buildCacheKey(context);
  const { cacheDir, filePath, metaPath } = getCachePaths(cacheKey, options.cacheDir);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...meta,
        cacheKey,
        eventName: context.eventName,
        country: context.country,
        releaseTime: context.releaseTime,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return { cacheKey, filePath };
}

function resetCacheForTests(cacheDir = DEFAULT_CACHE_DIR) {
  if (!fs.existsSync(cacheDir)) {
    return;
  }
  for (const entry of fs.readdirSync(cacheDir)) {
    fs.unlinkSync(path.join(cacheDir, entry));
  }
}

module.exports = {
  DEFAULT_CACHE_DIR,
  buildCacheKey,
  getCachePaths,
  readCachedImage,
  writeCachedImage,
  resetCacheForTests,
};
