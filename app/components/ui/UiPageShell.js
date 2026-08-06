"use client";

import { ui } from "./ui-theme";

export function UiPageShell({ className = "", children, ...props }) {
  return (
    <div className={`${ui.pageShell} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export default UiPageShell;
