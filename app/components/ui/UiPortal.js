"use client";

import { createPortal } from "react-dom";

export function UiPortal({ children, container = null }) {
  if (typeof document === "undefined") return null;
  const target = container || document.body;
  return createPortal(children, target);
}

export default UiPortal;
