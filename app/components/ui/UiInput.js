"use client";
import { ui } from "./ui-theme";
export function UiInput({ className = "", ...props }) {
  return (
    <input
      className={`${ui.input} ${ui.focusRing} ${className}`.trim()}
      {...props}
    />
  );
}
export default UiInput;
