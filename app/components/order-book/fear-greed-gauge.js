export const FEAR_GREED_GAUGE_SEGMENTS = [
  { from: 0, to: 20, color: "var(--ui-chart-fear-extreme)" },
  { from: 20, to: 40, color: "var(--ui-chart-fear)" },
  { from: 40, to: 60, color: "var(--ui-chart-neutral-mid)" },
  { from: 60, to: 80, color: "var(--ui-chart-greed-mid)" },
  { from: 80, to: 100, color: "var(--ui-chart-greed-extreme)" },
];
export function fearGreedClassificationAr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "محايد";
  if (n <= 19) return "خوف شديد";
  if (n <= 39) return "خوف";
  if (n <= 59) return "محايد";
  if (n <= 79) return "طمع";
  return "طمع شديد";
}
export function fearGreedPointerPosition(value) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const angleDeg = 180 - (clamped / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 100;
  const cy = 100;
  const r = 72;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
    angleDeg,
  };
}
export function describeFearGreedArcSegment(startValue, endValue, radius = 80) {
  const cx = 100;
  const cy = 100;
  const startAngle = 180 - (startValue / 100) * 180;
  const endAngle = 180 - (endValue / 100) * 180;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy - radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy - radius * Math.sin(endRad);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle < startAngle ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}
