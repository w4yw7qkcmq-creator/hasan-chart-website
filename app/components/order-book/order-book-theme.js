/**
 * Semantic Tailwind class bundles for Order Book page.
 * Pair with order-book-theme.css variables on `.ob-page` wrapper.
 */

export const ob = {
  page: "ob-page min-w-0",
  surface:
    "ob-surface rounded-2xl border shadow-sm backdrop-blur-sm",
  surfaceMuted:
    "ob-surface-muted rounded-xl border",
  textStrong: "ob-text-strong",
  textNormal: "ob-text-normal",
  textMuted: "ob-text-muted",
  textSubtle: "ob-text-subtle",
  label: "text-xs font-semibold ob-text-muted",
  eyebrow: "text-xs font-medium tracking-wide ob-text-subtle uppercase",
  heading: "text-2xl font-bold ob-text-strong sm:text-[1.65rem]",
  subheading: "text-lg font-bold ob-text-strong",
  body: "text-sm leading-6 ob-text-normal",
  input:
    "ob-input h-10 w-full min-w-0 rounded-xl border py-2 pl-3 pr-9 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ob-focus-ring)]",
  listboxTrigger:
    "ob-input flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border py-2 pl-3 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ob-focus-ring)]",
  listboxMenu:
    "ob-portal-menu max-h-56 overflow-y-auto overscroll-contain rounded-xl py-1 [scrollbar-width:thin]",
  listboxOption:
    "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-right text-sm transition motion-reduce:transition-none",
  listboxOptionActive: "ob-portal-option--active",
  listboxOptionIdle: "ob-portal-option--idle",
  listboxOptionSelected: "ob-portal-option--selected",
  listboxOptionPrimary: "ob-portal-option-primary min-w-0 flex-1 text-right font-medium",
  listboxOptionMuted: "ob-portal-option-muted block text-xs",
  listboxOptionMeta: "ob-portal-option-muted shrink-0 text-left tabular-nums text-xs",
  listboxSelectedMark: "ob-portal-option-check shrink-0 text-xs font-bold",
  portalStatusText: "ob-portal-option-muted px-3 py-2 text-sm",
  focusRing:
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ob-focus-ring)]",
  positive: "ob-positive",
  negative: "ob-negative",
  neutral: "ob-neutral",
  statTile:
    "flex h-full min-h-[7.75rem] min-w-0 flex-col rounded-xl border p-3 transition-colors motion-reduce:transition-none ob-surface-muted hover:border-[var(--ob-border-strong)]",
  tableHeader: "ob-table-header sticky top-0 z-10 border-b backdrop-blur-sm",
  rowHover: "ob-row-hover transition-colors motion-reduce:transition-none",
  midPrice: "ob-mid-row sticky z-[2] border-y px-3 py-1.5 text-center text-xs font-medium",
  badgeConnected:
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold border-[var(--ob-positive-border)] bg-[var(--ob-positive-soft)] ob-positive",
  badgePartial:
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ob-badge-warning",
  badgeDisconnected:
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold border-[var(--ob-negative-border)] bg-[var(--ob-negative-soft)] ob-negative",
  alertError:
    "rounded-xl border px-3 py-2 text-sm border-[var(--ob-negative-border)] bg-[var(--ob-negative-soft)] ob-negative",
  alertWarning:
    "rounded-xl border px-3 py-2 text-sm ob-badge-warning",
  alertInfo:
    "rounded-xl border px-3 py-2 text-sm ob-surface-muted ob-text-normal",
  chartShell: "ob-chart-shell overflow-hidden rounded-xl border",
  chartTooltip: "ob-chart-tooltip rounded-lg border px-2.5 py-2 text-[11px] leading-5 shadow-sm backdrop-blur",
  overlayScrim: "ob-overlay-scrim pointer-events-none absolute inset-0 backdrop-blur-[1px]",
  overlayPanel:
    "ob-overlay-panel rounded-lg border px-3 py-2 text-xs font-medium shadow-sm",
  badgeStale:
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ob-badge-warning",
  badgeRefreshing:
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ob-surface-muted ob-text-muted",
  segmentedTrack:
    "flex min-w-0 max-w-full rounded-xl border p-1 ob-surface-muted",
  segmentedBtn:
    "shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition motion-reduce:transition-none sm:text-sm",
  segmentedActive:
    "bg-[var(--ob-surface-elevated)] ob-text-strong shadow-sm ring-1 ring-[var(--ob-border-strong)]",
  segmentedIdle:
    "ob-text-muted hover:bg-[var(--ob-surface-muted)] hover:ob-text-strong",
  divider: "border-t ob-divider",
  badgeBuy:
    "ob-badge-buy inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  badgeSell:
    "ob-badge-sell inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  badgeCoverage:
    "ob-badge-coverage inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  badgeWarning:
    "ob-badge-warning inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
  badgeWarningCompact:
    "ob-badge-warning inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
  statusDotConnected: "ob-status-dot-connected h-1.5 w-1.5 rounded-full",
  statusDotProbing: "ob-status-dot-probing h-1.5 w-1.5 rounded-full animate-pulse",
  statusDotWarning: "ob-status-dot-warning h-2 w-2 rounded-full",
  statusDotDisconnected: "ob-status-dot-disconnected h-1.5 w-1.5 rounded-full",
  depthBuy: "ob-depth-buy transition-all motion-reduce:transition-none",
  depthSell: "ob-depth-sell transition-all motion-reduce:transition-none",
  wallBuy: "ob-wall-buy rounded-xl border",
  wallSell: "ob-wall-sell rounded-xl border",
  spinner:
    "ob-spinner inline-block h-3 w-3 animate-spin rounded-full border-2 motion-reduce:animate-none",
  segmentedRingBuy: "ring-1 ring-[var(--ob-positive-border)]",
  segmentedRingSell: "ring-1 ring-[var(--ob-negative-border)]",
};

export const UNSAFE_BORDER_PATTERNS = [
  /\bborder-slate-/,
  /\bborder-gray-/,
  /\bborder-zinc-/,
  /\bborder-neutral-/,
];

/** Badge/UI hardcoded palette — chart depth bars exempt via allowlist paths. */
export const UNSAFE_BADGE_COLOR_PATTERNS = [
  /\bborder-emerald-/,
  /\bbg-emerald-/,
  /\btext-emerald-/,
  /\bborder-rose-/,
  /\bbg-rose-/,
  /\btext-rose-/,
  /\bring-emerald-/,
  /\bring-rose-/,
];

export const BADGE_COLOR_ALLOWLIST = [
  "app/components/order-book/LiquidityDepthChart.js",
];

export const UNSAFE_COLOR_PATTERNS = [
  /\bbg-white\b/,
  /\btext-black\b/,
  /dark:text-slate-500/,
  /\btext-slate-400\b/,
  /\btext-slate-500\b/,
  /\bbg-slate-50\b/,
  /\bborder-slate-200\b/,
  /\btext-gray-900\b/,
  /style=\{\{\s*color:/,
  /style=\{\{\s*background(?!Image)/,
];

export const REQUIRED_THEME_MARKERS = [
  "ob-page",
  "ob-text-strong",
  "ob-surface",
  "--ob-text-strong",
];
