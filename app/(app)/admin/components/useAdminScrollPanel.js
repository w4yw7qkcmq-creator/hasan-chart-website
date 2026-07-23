"use client";

import { useCallback, useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button']";

export function useAdminScrollPanel({
  storageKey = "",
  enabled = true,
  restoreDeps = [],
} = {}) {
  const panelRef = useRef(null);
  const dragRef = useRef({ active: false, startY: 0, startScrollTop: 0, moved: false });
  const restoredRef = useRef(false);

  const saveScrollPosition = useCallback(() => {
    const el = panelRef.current;
    if (!el || !storageKey) return;

    try {
      sessionStorage.setItem(storageKey, String(el.scrollTop));
    } catch {
      // ignore storage failures
    }
  }, [storageKey]);

  const restoreScrollPosition = useCallback(() => {
    const el = panelRef.current;
    if (!el || !storageKey) return false;

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw == null) return false;

      const top = Number(raw);
      if (!Number.isFinite(top)) return false;

      el.scrollTop = top;
      restoredRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  useEffect(() => {
    restoredRef.current = false;
  }, [storageKey, ...restoreDeps]);

  useEffect(() => {
    if (!enabled) return undefined;

    const el = panelRef.current;
    if (!el) return undefined;

    el.tabIndex = 0;
    el.setAttribute("role", "region");
    if (!el.getAttribute("aria-label")) {
      el.setAttribute("aria-label", "قائمة قابلة للتمرير");
    }

    const onScroll = () => saveScrollPosition();
    el.addEventListener("scroll", onScroll, { passive: true });

    const onWheel = (event) => {
      if (el.scrollHeight <= el.clientHeight) return;
      event.stopPropagation();
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.preventDefault();
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });

    const onKeyDown = (event) => {
      if (document.activeElement !== el && !el.contains(document.activeElement)) return;
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

      const line = 48;
      const page = Math.max(el.clientHeight - line, line);

      switch (event.key) {
        case "PageDown":
          el.scrollTop += page;
          event.preventDefault();
          break;
        case "PageUp":
          el.scrollTop -= page;
          event.preventDefault();
          break;
        case "Home":
          el.scrollTop = 0;
          event.preventDefault();
          break;
        case "End":
          el.scrollTop = el.scrollHeight;
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const onMouseDown = (event) => {
      if (event.button !== 0) return;
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

      dragRef.current = {
        active: true,
        startY: event.clientY,
        startScrollTop: el.scrollTop,
        moved: false,
      };
      el.classList.add("admin-scroll-panel--dragging");
    };

    const onMouseMove = (event) => {
      const drag = dragRef.current;
      if (!drag.active) return;

      const delta = event.clientY - drag.startY;
      if (Math.abs(delta) > 3) {
        drag.moved = true;
      }
      el.scrollTop = drag.startScrollTop - delta;
    };

    const endDrag = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      el.classList.remove("admin-scroll-panel--dragging");
    };

    const onClickCapture = (event) => {
      if (!dragRef.current.moved) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current.moved = false;
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
      el.removeEventListener("click", onClickCapture, true);
      el.classList.remove("admin-scroll-panel--dragging");
    };
  }, [enabled, saveScrollPosition]);

  return { panelRef, saveScrollPosition, restoreScrollPosition };
}
