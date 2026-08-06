"use client";
import { ui } from "./ui-theme";
export function UiSelect({ className = "", children, ...props }) {
  return (
    <select
      className={`${ui.select} ${ui.focusRing} ${className}`.trim()}
      {...props}
    >
      {" "}
      {children}{" "}
    </select>
  );
}
export default UiSelect;
