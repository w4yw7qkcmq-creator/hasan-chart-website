/**
 * Canonical Design System component inventory.
 * Only components that exist on disk are tracked for coverage gates.
 */

export const EXPORTED_COMPONENTS = [
  { name: "UiButton", file: "UiButton.js", fixtureTestId: "ds-button-primary", keyboard: true },
  { name: "UiInput", file: "UiInput.js", fixtureTestId: "ds-input-text", keyboard: true },
  { name: "UiSelect", file: "UiSelect.js", fixtureTestId: "ds-select-native", keyboard: true },
  { name: "UiCard", file: "UiCard.js", fixtureTestId: "ds-card-root", keyboard: false },
  { name: "UiBadge", file: "UiBadge.js", fixtureTestId: "ds-badge-neutral", keyboard: false },
  { name: "UiAlert", file: "UiAlert.js", fixtureTestId: "ds-alert-info", keyboard: false },
  { name: "UiPageShell", file: "UiPageShell.js", fixtureTestId: "ds-page-shell", keyboard: false },
  { name: "UiPageHeader", file: "UiPageHeader.js", fixtureTestId: "ds-page-header", keyboard: false },
  { name: "UiModal", file: "UiModal.js", fixtureTestId: "ds-modal-opener", keyboard: true },
  { name: "UiEmptyState", file: "UiStates.js", fixtureTestId: "ds-empty-state", keyboard: false },
  { name: "UiLoadingState", file: "UiStates.js", fixtureTestId: "ds-loading-state", keyboard: false },
  { name: "UiErrorState", file: "UiStates.js", fixtureTestId: "ds-error-state", keyboard: false },
];

/** Exported but covered exclusively through a parent component at runtime. */
export const INTERNAL_THROUGH_PARENT = [
  { name: "UiPortal", file: "UiPortal.js", coveredBy: "UiModal" },
];

/**
 * Spec-level components not present in app/components/ui yet.
 * Documented so inventory gates do not treat them as unclassified debt.
 */
export const SPEC_NOT_IMPLEMENTED = [
  "UiSection",
  "UiStack",
  "UiGrid",
  "UiPanel",
  "UiGlassCard",
  "UiDivider",
  "UiIconButton",
  "UiTextarea",
  "UiCombobox",
  "UiCheckbox",
  "UiSwitch",
  "UiField",
  "UiFieldLabel",
  "UiFieldError",
  "UiDrawer",
  "UiDropdown",
  "UiPopover",
  "UiTooltip",
  "UiStatusBadge",
  "UiStatCard",
  "UiTable",
  "UiTabs",
  "UiProgress",
  "UiSkeleton",
  "UiSuccessState",
];

export const PUBLIC_RUNTIME_ROUTES = [
  "/",
  "/assets",
  "/order-book",
  "/news",
  "/subscriptions",
  "/account-management",
  "/partner-center",
  "/daily-analysis",
  "/my-dashboard",
  "/login",
  "/register",
  "/markets",
  "/crypto",
  "/forex",
  "/stocks",
  "/btc",
];

export const ADMIN_RUNTIME_ROUTES = [
  "/admin",
  "/admin/users",
  "/admin/financial-center",
  "/admin/partners",
  "/admin/email-analytics",
  "/admin/notification-test",
  "/admin/iam",
  "/admin/news",
];

export const RUNTIME_VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
];

export const RUNTIME_THEMES = ["light", "dark"];
