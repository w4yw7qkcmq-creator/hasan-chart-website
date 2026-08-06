const MIN_DEPTH_WIDTH = 8;
export function computeDepthBarWidthPercent(notional, maxNotional) {
  const value = Number(notional) || 0;
  const max = Number(maxNotional) || 0;
  if (max <= 0 || value <= 0) return 0;
  const ratio = value / max;
  const scaled = Math.sqrt(ratio);
  return Math.min(100, Math.max(MIN_DEPTH_WIDTH, scaled * 100));
}
