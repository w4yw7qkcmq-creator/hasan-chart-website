"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  ADMIN_COMMAND_ACTION_ITEMS,
  ADMIN_COMMAND_GROUPS,
  ADMIN_COMMAND_NAV_ITEMS,
  ADMIN_COMMAND_USER_SEARCH_DEBOUNCE_MS,
  ADMIN_COMMAND_USER_SEARCH_MIN_CHARS,
  buildUserCommandItems,
  filterStaticCommandItems,
  groupCommandResults,
  shouldIgnoreCommandPaletteShortcut,
} from "../../../../lib/admin-command-palette-helpers";
function flattenGroupedItems(groups) {
  const flat = [];
  for (const group of groups) {
    for (const item of group.items) {
      flat.push(item);
    }
  }
  return flat;
}
export default function AdminCommandPalette({
  open,
  onClose,
  onExecute,
  onOpenChange,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [userResults, setUserResults] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const lastFocusRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchRequestRef = useRef(0);
  const staticItems = useMemo(() => filterStaticCommandItems(query), [query]);
  const groupedItems = useMemo(() => {
    const userItems = buildUserCommandItems(userResults);
    return groupCommandResults([...staticItems, ...userItems]);
  }, [staticItems, userResults]);
  const flatItems = useMemo(
    () => flattenGroupedItems(groupedItems),
    [groupedItems],
  );
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setUserResults([]);
      setUserLoading(false);
      setUserError("");
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      return;
    }
    lastFocusRef.current = document.activeElement;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) =>
          Math.min(current + 1, Math.max(flatItems.length - 1, 0)),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === "Enter" && flatItems[activeIndex]) {
        event.preventDefault();
        onExecute?.(flatItems[activeIndex]);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, flatItems, activeIndex, onClose, onExecute]);
  useEffect(() => {
    if (!open) return undefined;
    return () => {
      const previous = lastFocusRef.current;
      if (previous && typeof previous.focus === "function") {
        requestAnimationFrame(() => previous.focus());
      }
    };
  }, [open]);
  useEffect(() => {
    setActiveIndex(0);
  }, [query, userResults.length]);
  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < ADMIN_COMMAND_USER_SEARCH_MIN_CHARS) {
      searchAbortRef.current?.abort();
      setUserResults([]);
      setUserLoading(false);
      setUserError("");
      return undefined;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      const requestId = ++searchRequestRef.current;
      setUserLoading(true);
      setUserError("");
      adminFetch(
        `/api/admin/user-management?search=${encodeURIComponent(trimmed)}&page=1&pageSize=5`,
        { method: "GET", cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const result = await response.json().catch(() => ({}));
          if (requestId !== searchRequestRef.current) return;
          if (!response.ok || !result?.success) {
            throw new Error(result?.error || "تعذر البحث عن المستخدمين");
          }
          setUserResults(result.users || []);
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          if (requestId !== searchRequestRef.current) return;
          setUserResults([]);
          setUserError(error?.message || "تعذر البحث");
        })
        .finally(() => {
          if (requestId !== searchRequestRef.current) return;
          setUserLoading(false);
        });
    }, ADMIN_COMMAND_USER_SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [open, query]);
  useEffect(() => {
    const item = flatItems[activeIndex];
    if (!item || !listRef.current) return;
    const node = listRef.current.querySelector(
      `[data-command-id="${item.id}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatItems]);
  const handleBackdropClose = useCallback(() => {
    onClose?.();
  }, [onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-command-palette" role="presentation">
      {" "}
      <button
        type="button"
        className="admin-command-palette__backdrop"
        onClick={handleBackdropClose}
        aria-label="إغلاق لوحة الأوامر"
      />{" "}
      <div
        className="admin-command-palette__panel"
        role="dialog"
        aria-modal="true"
        aria-label="لوحة الأوامر السريعة"
      >
        {" "}
        <div className="admin-command-palette__search-wrap">
          {" "}
          <span aria-hidden="true">⌘K</span>{" "}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن أمر أو مستخدم..."
            className="admin-command-palette__input"
            aria-label="بحث في لوحة الأوامر"
          />{" "}
          <button
            type="button"
            className="admin-command-palette__close"
            onClick={handleBackdropClose}
          >
            {" "}
            Esc{" "}
          </button>{" "}
        </div>{" "}
        <div ref={listRef} className="admin-command-palette__results">
          {" "}
          {userLoading ? (
            <p className="admin-command-palette__hint">
              جاري البحث عن المستخدمين...
            </p>
          ) : null}{" "}
          {userError ? (
            <p className="admin-command-palette__hint admin-command-palette__hint--error">
              {userError}
            </p>
          ) : null}{" "}
          {flatItems.length === 0 && !userLoading ? (
            <p className="admin-command-palette__empty">لا توجد أوامر مطابقة</p>
          ) : (
            groupedItems.map((group) => (
              <section key={group.id} className="admin-command-palette__group">
                {" "}
                <p className="admin-command-palette__group-label">
                  {group.label}
                </p>{" "}
                <div className="admin-command-palette__group-items">
                  {" "}
                  {group.items.map((item) => {
                    const isActive = flatItems[activeIndex]?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-command-id={item.id}
                        className={`admin-command-palette__item ${isActive ? "is-active" : ""}`}
                        onMouseEnter={() => {
                          const index = flatItems.findIndex(
                            (entry) => entry.id === item.id,
                          );
                          if (index >= 0) setActiveIndex(index);
                        }}
                        onClick={() => onExecute?.(item)}
                      >
                        {" "}
                        <span
                          className="admin-command-palette__item-icon"
                          aria-hidden="true"
                        >
                          {" "}
                          {item.icon}{" "}
                        </span>{" "}
                        <span className="min-w-0 flex-1 text-right">
                          {" "}
                          <span className="admin-command-palette__item-label">
                            {item.label}
                          </span>{" "}
                          {item.subtitle ? (
                            <span className="admin-command-palette__item-subtitle">
                              {item.subtitle}
                            </span>
                          ) : null}{" "}
                        </span>{" "}
                        {item.accountStatus ? (
                          <span className="admin-command-palette__item-badge">
                            {item.accountStatus}
                          </span>
                        ) : null}{" "}
                      </button>
                    );
                  })}{" "}
                </div>{" "}
              </section>
            ))
          )}{" "}
        </div>{" "}
        <div className="admin-command-palette__footer">
          {" "}
          <span>↑↓ للتنقل</span> <span>Enter للتنفيذ</span>{" "}
          <span>Esc للإغلاق</span>{" "}
        </div>{" "}
      </div>{" "}
    </div>,
    document.body,
  );
}
export function useAdminCommandPaletteShortcut(onToggle) {
  useEffect(() => {
    const onKeyDown = (event) => {
      const isMac =
        typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || String(event.key).toLowerCase() !== "k") return;
      if (shouldIgnoreCommandPaletteShortcut(event.target)) return;
      event.preventDefault();
      onToggle?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onToggle]);
}
export const ADMIN_COMMAND_STATIC_COUNT =
  ADMIN_COMMAND_NAV_ITEMS.length + ADMIN_COMMAND_ACTION_ITEMS.length;
export { ADMIN_COMMAND_GROUPS };
