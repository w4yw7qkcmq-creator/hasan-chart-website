import fs from "node:fs";
import path from "node:path";
import { baselinePath } from "./paths.mjs";

/** Max allowed diff ratio (0–1). Allows anti-aliasing / minor shifts. */
export const VISUAL_DIFF_THRESHOLD = 0.01;

/**
 * Compare PNG against baseline using pixelmatch (tolerant, not pixel-perfect).
 * Creates baseline if missing.
 * @returns {Promise<{ status: string, note?: string, diffRatio?: number, baselineCreated?: boolean }>}
 */
export async function compareScreenshot({ currentPath, filename, threshold = VISUAL_DIFF_THRESHOLD }) {
  if (!fs.existsSync(currentPath)) {
    return { status: "FAIL", note: `screenshot missing: ${filename}` };
  }

  const baseline = baselinePath(filename);

  if (!fs.existsSync(baseline)) {
    fs.copyFileSync(currentPath, baseline);
    return {
      status: "PASS",
      note: `baseline created for ${filename}`,
      baselineCreated: true,
    };
  }

  let PNG;
  let pixelmatch;
  try {
    ({ PNG } = await import("pngjs"));
    pixelmatch = (await import("pixelmatch")).default;
  } catch {
    return {
      status: "BLOCKED",
      note: "install devDependencies: pngjs pixelmatch (npm install)",
    };
  }

  const imgA = PNG.sync.read(fs.readFileSync(baseline));
  const imgB = PNG.sync.read(fs.readFileSync(currentPath));

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      status: "FAIL",
      note: `VISUAL REGRESSION — size mismatch ${filename} (${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height})`,
    };
  }

  const { width, height } = imgA;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
    threshold: 0.15,
    includeAA: true,
    alpha: 0.7,
  });

  const diffRatio = diffPixels / (width * height);

  if (diffRatio > threshold) {
    const diffOut = path.join(path.dirname(currentPath), filename.replace(".png", ".diff.png"));
    fs.writeFileSync(diffOut, PNG.sync.write(diff));
    return {
      status: "FAIL",
      note: `VISUAL REGRESSION — ${filename} diff=${(diffRatio * 100).toFixed(2)}% (max ${(threshold * 100).toFixed(2)}%)`,
      diffRatio,
    };
  }

  return {
    status: "PASS",
    note: `visual ok ${filename} diff=${(diffRatio * 100).toFixed(2)}%`,
    diffRatio,
  };
}
