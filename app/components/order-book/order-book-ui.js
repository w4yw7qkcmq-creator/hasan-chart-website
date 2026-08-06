"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CLIENT_REGISTRY_RETRY_MS } from "../../../lib/market-data/dynamic-symbol-constants.js";
import { formatMarketSymbol } from "../../../lib/market-data/symbols.js";
import { formatCoveragePercent } from "../../../lib/market-data/history/window-utils.js";
import { ob } from "./order-book-theme.js";

const STAT_ICONS = {
  spread: "↔",
  buy: "▲",
  sell: "▼",
  flow: "⇄",
  coverage: "◔",
  default: "◆",
};

export function NumericValue({ children, className = "" }) {
  return (
    <span dir="ltr" className={`inline-block tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export function ConnectionStatusBadge({ connectedCount, totalExchanges, probing }) {
  const connected = Number(connectedCount) || 0;
  const total = Number(totalExchanges) || 3;
  const allConnected = connected >= total && !probing;
  const partial = connected > 0 && connected < total;
  const label = probing
    ? "جاري التحقق من المنصات..."
    : allConnected
      ? `${connected}/${total} متصل`
      : partial
        ? `${connected}/${total} اتصال جزئي`
        : "غير متصل";

  const className = probing
    ? ob.badgePartial
    : allConnected
      ? ob.badgeConnected
      : partial
        ? ob.badgePartial
        : ob.badgeDisconnected;

  return (
    <span className={className} role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          allConnected
            ? ob.statusDotConnected
            : partial
              ? ob.statusDotWarning
              : ob.statusDotDisconnected
        }`}
      />
      {label}
    </span>
  );
}

export function Panel({ title, description, children, action, className = "", compact = false }) {
  return (
    <section
      className={`min-w-0 overflow-x-hidden ${ob.surface} ${
        compact ? "p-3 sm:p-4" : "p-4 sm:p-5"
      } ${className}`}
    >
      <div className={`min-w-0 shrink-0 ${compact ? "mb-3" : "mb-4"}`}>
        <h2 className={`${ob.subheading} text-lg`}>{title}</h2>
        {description ? <p className={`mt-1 ${ob.body} ob-text-muted`}>{description}</p> : null}
        {action ? <div className="mt-3 w-full min-w-0 max-w-full">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SegmentedControl({
  label,
  value,
  onChange,
  options,
  compact = false,
  ariaLabel,
  scrollable = false,
  mobileScrollable = false,
  className = "",
}) {
  const trackClass = scrollable
    ? "overflow-x-auto scrollbar-none"
    : mobileScrollable
      ? "flex-wrap overflow-visible max-lg:overflow-x-auto max-lg:scrollbar-none"
      : "flex-wrap";

  return (
    <div className={`flex min-w-0 max-w-full flex-col gap-1.5 ${className}`}>
      {label ? <span className={ob.label}>{label}</span> : null}
      <div
        className={`${ob.segmentedTrack} ${trackClass}`}
        role="tablist"
        aria-label={ariaLabel || label}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={`${ob.segmentedBtn} ${ob.focusRing} ${compact ? "py-1.5" : "py-2"} ${
                active ? ob.segmentedActive : ob.segmentedIdle
              } ${option.tone === "buy" && active ? ob.segmentedRingBuy : ""} ${
                option.tone === "sell" && active ? ob.segmentedRingSell : ""
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LISTBOX_MENU_MAX_HEIGHT = 224;

function useListboxMenuPosition(open, triggerRef) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setStyle(null);
      return undefined;
    }

    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < LISTBOX_MENU_MAX_HEIGHT && spaceAbove > spaceBelow;
      setStyle({
        position: "fixed",
        left: `${Math.max(8, rect.left)}px`,
        width: `${rect.width}px`,
        top: openUp ? `${rect.top - 4}px` : `${rect.bottom + 4}px`,
        transform: openUp ? "translateY(-100%)" : undefined,
        zIndex: 60,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  return style;
}

export function OrderBookListbox({
  label,
  value,
  onChange,
  options,
  ariaLabel,
  loading = false,
  disabled = false,
  compact = false,
  optionValueDir = "rtl",
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuStyle = useListboxMenuPosition(open, triggerRef);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  );
  const selected = options[selectedIndex] || options[0];

  useEffect(() => {
    if (!open) return undefined;
    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function selectOption(option) {
    if (!option || disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event) {
    if (disabled) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  }

  const menu = open && menuStyle && typeof document !== "undefined"
    ? createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel || label}
          style={menuStyle}
          className={`${ob.listboxMenu} ${ob.focusRing}`}
        >
          {options.map((option, index) => {
            const active = index === activeIndex;
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${ob.listboxOption} ${isSelected ? ob.listboxOptionSelected : ""} ${active ? ob.listboxOptionActive : ob.listboxOptionIdle}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  <span
                    dir={optionValueDir}
                    className={`${ob.listboxOptionPrimary} ${optionValueDir === "ltr" ? "tabular-nums" : ""}`}
                  >
                    {option.label}
                  </span>
                  {isSelected ? (
                    <span aria-hidden="true" className={ob.listboxSelectedMark}>
                      ✓
                    </span>
                  ) : (
                    <span aria-hidden="true" className="w-3 shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${compact ? "min-w-[7rem]" : ""}`}>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">
        {label ? <span className={ob.label}>{label}</span> : null}
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel || label}
          disabled={disabled || loading}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={onKeyDown}
          className={`${ob.listboxTrigger} ${ob.focusRing} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span dir={optionValueDir} className={`min-w-0 flex-1 truncate text-right ${optionValueDir === "ltr" ? "tabular-nums" : ""}`}>
            {selected?.label || "—"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            {loading ? <RefreshSpinner className="h-3.5 w-3.5" /> : null}
            <span aria-hidden="true" className={ob.textSubtle}>
              ▾
            </span>
          </span>
        </button>
      </div>
      {menu}
    </div>
  );
}

/** @deprecated Use OrderBookListbox */
export const StyledSelect = OrderBookListbox;

export function SymbolSearchCombobox({
  label = "العملة",
  value,
  onChange,
  entries = [],
  ariaLabel = "اختيار العملة",
  loading = false,
  unavailable = false,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const retryTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteEntries, setRemoteEntries] = useState([]);
  const [fetchState, setFetchState] = useState("idle");
  const [lastGoodEntries, setLastGoodEntries] = useState(entries);

  const selected =
    [...entries, ...remoteEntries, ...lastGoodEntries].find((entry) => entry.value === value) ||
    (value
      ? {
          value,
          label: formatMarketSymbol(value),
        }
      : null);

  const filtered = useMemo(() => {
    const pool = remoteEntries.length ? remoteEntries : lastGoodEntries.length ? lastGoodEntries : entries;
    const raw = String(query || "").trim();
    if (!raw) return pool.slice(0, 50);
    const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return pool.filter((entry) => {
      const candidates = [entry.value, entry.label, entry.base, entry.displayName, entry.displaySymbol]
        .filter(Boolean)
        .map((item) => String(item).toUpperCase());
      return candidates.some((candidate) => candidate.includes(compact) || compact.includes(candidate.replace("/", "")));
    });
  }, [entries, lastGoodEntries, query, remoteEntries]);

  const fetchSymbols = useCallback(async (searchQuery) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetchState("loading");

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("query", searchQuery);
      params.set("limit", "50");
      params.set("minExchanges", "2");

      const response = await fetch(`/api/market-symbols?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const payload = await response.json();
      if (!payload?.success) {
        setFetchState("error");
        return;
      }

      const mapped = (payload.symbols || []).map((entry) => ({
        value: entry.symbol,
        label: entry.displaySymbol,
        base: entry.base,
        displayName: entry.displayName,
        displaySymbol: entry.displaySymbol,
        supportedExchangeCount: entry.supportedExchangeCount,
        supportedExchanges: entry.supportedExchanges,
      }));

      setRemoteEntries(mapped);
      if (mapped.length) setLastGoodEntries(mapped);
      setFetchState(payload.available === false ? "unavailable" : "idle");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void fetchSymbols("");
  }, [fetchSymbols]);

  useEffect(() => {
    if (fetchState !== "unavailable") {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return undefined;
    }

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void fetchSymbols(query);
    }, CLIENT_REGISTRY_RETRY_MS);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [fetchState, fetchSymbols, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSymbols(query);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, fetchSymbols]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, filtered.length]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const displayValue = open ? query : selected?.label || "";

  function selectEntry(entry) {
    if (!entry) return;
    onChange(entry.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectEntry(filtered[activeIndex]);
    }
  }

  const listLoading = fetchState === "loading" || loading;
  const listUnavailable = fetchState === "unavailable" || unavailable;
  const menuStyle = useListboxMenuPosition(open, inputRef);

  const symbolMenu = open && menuStyle && typeof document !== "undefined"
    ? createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel || label}
          style={menuStyle}
          className={`${ob.listboxMenu} ${ob.focusRing}`}
        >
          {listLoading && !filtered.length ? (
            <li className={ob.portalStatusText} role="status" aria-live="polite">
              جاري البحث...
            </li>
          ) : null}
          {listUnavailable && !filtered.length ? (
            <li className={ob.portalStatusText} role="status" aria-live="polite">
              قائمة العملات غير متاحة مؤقتًا
            </li>
          ) : null}
          {filtered.length ? (
            filtered.map((entry, index) => {
              const active = index === activeIndex;
              const isSelected = entry.value === value;
              const exchangeLabel =
                entry.supportedExchangeCount >= 3
                  ? "3 منصات"
                  : entry.supportedExchangeCount === 2
                    ? "منصتان"
                    : null;
              return (
                <li key={entry.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${ob.listboxOption} ${isSelected ? ob.listboxOptionSelected : ""} ${active ? ob.listboxOptionActive : ob.listboxOptionIdle}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectEntry(entry)}
                  >
                    <span className="min-w-0 text-right">
                      <span className={ob.listboxOptionPrimary}>{entry.label}</span>
                      {entry.displayName ? (
                        <span className={ob.listboxOptionMuted}>{entry.displayName}</span>
                      ) : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      <span dir="ltr" className={ob.listboxOptionMeta}>
                        {exchangeLabel || entry.value}
                      </span>
                      {isSelected ? (
                        <span aria-hidden="true" className={ob.listboxSelectedMark}>
                          ✓
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          ) : !listLoading ? (
            <li className={ob.portalStatusText}>لا توجد نتائج</li>
          ) : null}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className={ob.label}>{label}</span>
        <div className="relative min-w-0">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel}
            placeholder="ابحث عن عملة USDT (مثل DOGE, LTC, BTC)"
            value={displayValue}
            onFocus={() => {
              setOpen(true);
              setQuery("");
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className={`${ob.input} pr-10 ${ob.focusRing}`}
          />
          {listLoading ? (
            <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2">
              <RefreshSpinner className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${ob.textSubtle}`}
          >
            ▾
          </span>
        </div>
      </label>

      {symbolMenu}
    </div>
  );
}

export function SideBadge({ side, variant = "bid" }) {
  const isBuy = variant === "bid" || side === "bid" || side === "buy";
  return (
    <span className={isBuy ? ob.badgeBuy : ob.badgeSell}>
      {isBuy ? "شراء" : "بيع"}
    </span>
  );
}

export function CoverageBadge({ partial, coveragePercent, compact = false, forceShow = false }) {
  if (!forceShow && !partial) return null;
  const label = formatCoveragePercent(coveragePercent);
  if (!forceShow && !Number.isFinite(Number(coveragePercent))) return null;
  return (
    <span
      title="تمثل نسبة البيانات التاريخية المتوفرة لهذا الإطار الزمني."
      className={`${ob.badgeCoverage} ${compact ? "px-2 py-0.5 text-[10px]" : ""}`}
    >
      التغطية <NumericValue className="mx-0.5">{label}%</NumericValue>
    </span>
  );
}

export function RefreshSpinner({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`${ob.spinner} ${className}`}
    />
  );
}

export function DepthHistoryState({ loading, error, partial, coveragePercent, collecting, minHeight = "h-44 sm:h-48" }) {
  if (loading) {
    return (
      <div className={`mb-3 flex ${minHeight} items-center justify-center rounded-xl text-sm ob-surface-muted ob-text-muted`} role="status" aria-live="polite">
        جاري تحميل جدران السيولة التاريخية...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`mb-3 flex ${minHeight} items-center justify-center rounded-xl border px-4 text-sm ${ob.alertError}`} role="alert">
        تعذّر تحميل بيانات السيولة التاريخية.
      </div>
    );
  }

  if (collecting && (!Number.isFinite(coveragePercent) || coveragePercent <= 0)) {
    return (
      <p className={`mb-3 ${ob.badgeWarningCompact} border px-2.5 py-1.5`}>
        البيانات التاريخية قيد التجميع
      </p>
    );
  }

  if (partial) {
    return (
      <div className="mb-3">
        <CoverageBadge partial={partial} coveragePercent={coveragePercent} compact />
      </div>
    );
  }

  return null;
}

export function HistoryState({
  loading,
  error,
  partial,
  coveragePercent,
  collecting = false,
  empty = false,
  emptyMessage = "لا توجد بيانات كافية ضمن هذا الإطار حتى الآن.",
  errorMessage = "تعذر تحميل البيانات التاريخية. حاول تحديث الإطار أو أعد المحاولة لاحقًا.",
}) {
  if (loading) {
    return (
      <p className={`mb-3 min-h-[2.5rem] rounded-lg px-3 py-2 text-xs ${ob.alertInfo}`} role="status" aria-live="polite">
        جاري تحميل البيانات التاريخية...
      </p>
    );
  }

  if (error) {
    return (
      <p className={`mb-3 min-h-[2.5rem] rounded-lg px-3 py-2 text-xs ${ob.alertError}`} role="alert">
        {errorMessage}
      </p>
    );
  }

  if (collecting) {
    return (
      <p className={`mb-3 min-h-[2.5rem] rounded-lg px-2.5 py-1.5 text-xs ${ob.alertWarning}`} role="status" aria-live="polite">
        جاري جمع البيانات التاريخية لهذا الرمز.
      </p>
    );
  }

  if (empty) {
    return (
      <p className={`mb-3 min-h-[2.5rem] rounded-lg px-3 py-2 text-xs ${ob.alertInfo}`} role="status">
        {emptyMessage}
      </p>
    );
  }

  if (partial) {
    return (
      <div className="mb-3">
        <CoverageBadge partial={partial} coveragePercent={coveragePercent} compact />
      </div>
    );
  }

  return null;
}

export function MetricLine({ label, value, tone }) {
  const toneClass =
    tone === "buy" ? ob.positive : tone === "sell" ? ob.negative : ob.textStrong;

  return (
    <div className={`flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0 border-[var(--ob-border)]`}>
      <span className={ob.textNormal}>{label}</span>
      <NumericValue className={`font-semibold ${toneClass}`}>{value}</NumericValue>
    </div>
  );
}

export function FlowSplitBar({ buyPercent = 0, sellPercent = 0 }) {
  const buy = Math.max(0, Math.min(100, Number(buyPercent) || 0));
  const sell = Math.max(0, Math.min(100, Number(sellPercent) || 0));
  const total = buy + sell || 1;
  const buyWidth = (buy / total) * 100;
  const sellWidth = (sell / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--ob-surface-muted)]">
        <div
          className={ob.depthBuy}
          style={{ width: `${buyWidth}%` }}
          aria-hidden="true"
        />
        <div
          className={ob.depthSell}
          style={{ width: `${sellWidth}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-xs ob-text-muted">
        <span>
          شراء <NumericValue>{buy.toFixed(1)}%</NumericValue>
        </span>
        <span>
          بيع <NumericValue>{sell.toFixed(1)}%</NumericValue>
        </span>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  sublabel,
  value,
  tone,
  coveragePercent,
  partial,
  isRefreshing = false,
  initialLoading = false,
  icon,
}) {
  const toneClass =
    tone === "buy" ? ob.positive : tone === "sell" ? ob.negative : tone === "neutral" ? ob.neutral : ob.textStrong;

  const iconGlyph =
    icon || (tone === "buy" ? STAT_ICONS.buy : tone === "sell" ? STAT_ICONS.sell : STAT_ICONS.default);

  const showCoverage =
    partial && Number.isFinite(coveragePercent) && coveragePercent > 0 && coveragePercent < 99;
  const showSkeleton = initialLoading && (value == null || value === "");

  return (
    <div className={ob.statTile}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${ob.surfaceMuted} ob-text-muted`} aria-hidden="true">
            {iconGlyph}
          </span>
          <div className="min-w-0">
            <p className={ob.label}>{label}</p>
            {sublabel ? <p className={`mt-0.5 text-xs ${ob.textSubtle}`}>{sublabel}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isRefreshing ? <RefreshSpinner /> : null}
          {showCoverage ? <CoverageBadge partial coveragePercent={coveragePercent} compact /> : null}
        </div>
      </div>
      <div className="mt-auto pt-2">
        {showSkeleton ? (
          <div className="h-7 w-20 animate-pulse rounded-md bg-[var(--ob-surface-muted)] motion-reduce:animate-none" />
        ) : (
          <p className={`text-xl font-bold sm:text-2xl ${toneClass}`}>
            <NumericValue>{value ?? "—"}</NumericValue>
          </p>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ message, icon = "◌" }) {
  return (
    <div className={`flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center ob-surface-muted`}>
      <span className={`mb-2 text-2xl ${ob.textSubtle}`} aria-hidden="true">
        {icon}
      </span>
      <p className={`text-sm leading-6 ${ob.textMuted}`} role="status">
        {message}
      </p>
    </div>
  );
}

export function ChartPlaceholder({ message, minHeight = "h-44 sm:h-48" }) {
  return (
    <div
      className={`flex ${minHeight} items-center justify-center rounded-xl border border-dashed text-sm ob-surface-muted ob-text-muted`}
      role="status"
    >
      {message}
    </div>
  );
}
