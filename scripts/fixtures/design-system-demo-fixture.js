/**
 * Design System demo fixture — static class references for guard tests.
 */
import { ui } from "../../app/components/ui/ui-theme.js";

export const DESIGN_SYSTEM_DEMO_MARKERS = [
  "ui-page-shell",
  "ui-card",
  "ui-btn--primary",
  ui.pageShell,
  ui.card,
  ui.btnPrimary,
];

export function assertDesignSystemDemoMarkers() {
  return DESIGN_SYSTEM_DEMO_MARKERS.every(Boolean);
}
