/** * Read design-system chart/surface tokens at runtime (avoids hex literals in JSX). */
export function getUiToken(name) {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
export const chartColor = {
  series1: "var(--ui-chart-series-1)",
  series2: "var(--ui-chart-series-2)",
  axis: "var(--ui-chart-axis)",
  buy: "var(--ui-chart-buy)",
  sell: "var(--ui-chart-sell)",
  neutral: "var(--ui-chart-neutral)",
  tooltipBg: "var(--ui-chart-tooltip-bg)",
  tooltipText: "var(--ui-chart-tooltip-text)",
  fearExtreme: "var(--ui-chart-fear-extreme)",
  fear: "var(--ui-chart-fear)",
  neutralMid: "var(--ui-chart-neutral-mid)",
  greedMid: "var(--ui-chart-greed-mid)",
  greedExtreme: "var(--ui-chart-greed-extreme)",
  fallback: "var(--ui-chart-fallback)",
  pageDark: "var(--ui-page-dark-bg)",
  glassSolid: "var(--ui-glass-solid)",
};
