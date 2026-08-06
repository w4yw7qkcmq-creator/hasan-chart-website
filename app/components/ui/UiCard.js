"use client";
import { ui } from "./ui-theme";
export function UiCard({ className = "", children, ...props }) {
  return (
    <div className={`${ui.card} ${className}`.trim()} {...props}>
      {" "}
      {children}{" "}
    </div>
  );
}
export default UiCard;
