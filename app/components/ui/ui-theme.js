/**
 * Semantic class bundles for the shared Design System.
 * Pair with app/design-system/design-system-theme.css tokens.
 */

export const ui = {
  surface: "ui-surface rounded-2xl shadow-sm backdrop-blur-sm",
  surfaceMuted: "ui-surface-muted rounded-xl",
  textStrong: "ui-text-strong",
  textMuted: "ui-text-muted",
  textSubtle: "ui-text-subtle",
  input:
    "ui-input h-10 w-full min-w-0 rounded-xl px-3 py-2 text-sm outline-none transition",
  select:
    "ui-input h-10 w-full min-w-0 appearance-none rounded-xl px-3 py-2 text-sm outline-none transition",
  btn: "ui-btn",
  btnPrimary: "ui-btn ui-btn--primary px-4 py-2.5 text-sm",
  btnSecondary: "ui-btn ui-btn--secondary px-4 py-2.5 text-sm",
  btnGhost: "ui-btn ui-btn--ghost px-4 py-2.5 text-sm",
  btnDanger: "ui-btn ui-btn--danger px-4 py-2.5 text-sm",
  card: "ui-card p-5",
  badgeNeutral: "ui-badge ui-badge--neutral",
  badgePositive: "ui-badge ui-badge--positive",
  badgeNegative: "ui-badge ui-badge--negative",
  badgeWarning: "ui-badge ui-badge--warning",
  alertInfo: "ui-alert ui-alert--info",
  alertSuccess: "ui-alert ui-alert--success",
  alertWarning: "ui-alert ui-alert--warning",
  alertError: "ui-alert ui-alert--error",
  portalMenu: "ui-portal-menu max-h-56 overflow-y-auto overscroll-contain rounded-xl py-1",
  portalOptionActive: "ui-portal-option--active",
  portalOptionIdle: "ui-portal-option--idle",
  modalScrim: "ui-modal-scrim pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center px-5",
  modalPanel: "ui-modal-panel w-full max-w-md p-8 text-center",
  pageShell: "ui-page-shell min-w-0",
  pageHeader: "ui-page-header",
  pageHeaderTitle: "ui-page-header__title",
  pageHeaderSubtitle: "ui-page-header__subtitle",
  empty: "ui-empty",
  loading: "ui-loading",
  error: "ui-error",
  focusRing:
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus-ring)]",
};

export const UNSAFE_UI_PATTERNS = [
  /\bbg-white\b/,
  /\btext-black\b/,
  /\bdark:bg-/,
  /\bdark:text-/,
  /\btext-slate-900\b/,
  /\bborder-slate-/,
  /#[0-9a-fA-F]{3,8}\b/,
  /<select[\s>]/,
  /\[class\*="/,
];

export const FINANCIAL_CHART_ALLOWLIST = [
  "TradingView",
  "tradingview",
  "lightweight-charts",
  "chart-container",
];

export const LEGACY_UI_PATH_PREFIXES = [
  "app/components/order-book/",
  "app/(app)/order-book/",
  "app/components/RootLayoutShell.js",
  "app/components/AppModal.js",
  "app/(app)/admin/",
  "app/components/iam/",
  "app/components/asset-hub/",
  "app/components/market/",
];
