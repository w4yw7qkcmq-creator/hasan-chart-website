"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useClientMounted } from "../hooks/useClientMounted";
import {
  publicStaticMenuGroups as menuGroups,
  shouldPrefetchSidebarHref,
  siteShellSocialLinks as socialLinks,
} from "../../lib/site-shell-navigation";
import { useTheme } from "./ThemeProvider";

const MOBILE_HEADER_SCROLL_MQ = "(max-width: 1023px)";
const MOBILE_HEADER_TOP_THRESHOLD_PX = 12;
const MOBILE_HEADER_DIRECTION_DELTA_PX = 10;

function resolveSidebarHref(item, authResolved, currentUser) {
  if (!item.loginGate) {
    return item.href;
  }

  if (authResolved && currentUser) {
    return item.href;
  }

  return `/login?next=${encodeURIComponent(item.href)}`;
}

function resolveMenuItemState(item, authResolved, currentUser) {
  if (!item.auth && !item.plan) {
    return "visible";
  }

  if (!authResolved) {
    return "pending";
  }

  if (item.auth && !currentUser) {
    return "hidden";
  }

  return "visible";
}

const sidebarMenuItemClass =
  "sidebar-nav-item group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] px-4 py-3 text-white";

const sidebarMenuItemDesktopClass = `${sidebarMenuItemClass} sidebar-nav-item--interactive`;

function SidebarMenuItem({ item, state, authResolved, currentUser, onNavigate, variant = "desktop" }) {
  const itemClass = variant === "desktop" ? sidebarMenuItemDesktopClass : sidebarMenuItemClass;
  const href = resolveSidebarHref(item, authResolved, currentUser);

  if (state === "hidden") {
    return null;
  }

  if (state === "pending") {
    return (
      <div
        className={`${itemClass} pointer-events-none cursor-wait opacity-60`}
        aria-hidden="true"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">
          {item.icon}
        </span>
        <span className="font-bold leading-none">{item.label}</span>
      </div>
    );
  }

  return (
    <Link
      key={item.href}
      href={href}
      prefetch={shouldPrefetchSidebarHref(href)}
      onClick={onNavigate}
      className={itemClass}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">
        {item.icon}
      </span>
      <span className="font-bold leading-none">{item.label}</span>
    </Link>
  );
}

function SidebarMenuGroup({ group, isOpen, onToggle, children, variant = "desktop" }) {
  const hasVisibleChildren = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);

  if (!hasVisibleChildren) {
    return null;
  }

  const summaryClass =
    variant === "desktop"
      ? "sidebar-section-toggle sidebar-section-toggle--interactive flex min-h-[48px] cursor-pointer list-none items-center gap-3 rounded-[16px] px-3 py-2.5 text-white"
      : "sidebar-section-toggle flex min-h-[48px] cursor-pointer list-none items-center gap-3 rounded-[16px] px-3 py-2.5 text-white";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className={`${summaryClass} w-full text-right`}
        aria-expanded={isOpen}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-sm">
          {group.icon}
        </span>
        <span className="font-black leading-none">{group.label}</span>
        <span className={`mr-auto text-cyan-100/60 transition ${isOpen ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {isOpen ? <div className="space-y-2 pr-1">{children}</div> : null}
    </div>
  );
}

function renderSidebarGroups({
  authResolved,
  currentUser,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
  variant = "desktop",
}) {
  return menuGroups.map((group) => {
    const isOpen = collapsedGroups[group.id] ?? group.defaultOpen;

    const items = group.items
      .map((item) => {
        const state = resolveMenuItemState(item, authResolved, currentUser);

        return (
          <SidebarMenuItem
            key={item.href}
            item={item}
            state={state}
            authResolved={authResolved}
            currentUser={currentUser}
            onNavigate={onNavigate}
            variant={variant}
          />
        );
      })
      .filter(Boolean);

    return (
      <SidebarMenuGroup
        key={group.id}
        group={group}
        isOpen={isOpen}
        onToggle={onToggleGroup}
        variant={variant}
      >
        {items}
      </SidebarMenuGroup>
    );
  });
}

function AuthLoginLink({ className, onClick, compact = false }) {
  return (
    <Link href="/login" onClick={onClick} className={className}>
      {compact ? (
        <>
          <span className="max-[359px]:hidden">الدخول للحساب</span>
          <span className="hidden max-[359px]:inline">دخول</span>
        </>
      ) : (
        "الدخول للحساب"
      )}
    </Link>
  );
}

function resolveThemeToggleLabel(theme, { compact = false, mobile = false } = {}) {
  const isLight = theme === "light";

  if (mobile) {
    return isLight ? "🌙 تفعيل الوضع الليلي" : "☀️ تفعيل الوضع النهاري";
  }

  if (compact) {
    return isLight ? "🌙 ليلي" : "☀️ نهاري";
  }

  return isLight ? "🌙 الوضع الليلي" : "☀️ الوضع النهاري";
}

function LayoutPageSlot({ children }) {
  return <main className="w-full p-3 pt-3 md:p-4 md:pt-4">{children}</main>;
}

const MemoizedLayoutPageSlot = memo(LayoutPageSlot);

function ContactSection() {
  return (
    <details className="group/contact sidebar-nav-item rounded-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <summary className="sidebar-nav-item sidebar-nav-item--interactive flex min-h-[54px] cursor-pointer list-none items-center gap-3 rounded-[18px] px-4 py-3 text-white">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">
          ☎️
        </span>
        <span className="font-bold leading-none">تواصل معنا</span>
        <span className="mr-auto text-cyan-100/60 transition group-open/contact:rotate-180">⌄</span>
      </summary>

      <div className="space-y-2 px-3 pb-3 pt-1">
        <Link
          href="/about"
          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07142f]/70 px-3 py-2.5 text-sm no-underline transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/10">
              ℹ️
            </span>
            <div>
              <p className="font-bold text-white">من نحن</p>
              <p className="text-[11px] text-cyan-100/55">تعرف على المنصة</p>
            </div>
          </div>
          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100">
            فتح
          </span>
        </Link>

        {socialLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07142f]/70 px-3 py-2.5 text-sm transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/10">
                {link.icon}
              </span>
              <div>
                <p className="font-bold text-white">{link.label}</p>
                <p className="text-[11px] text-cyan-100/55">{link.badge}</p>
              </div>
            </div>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100">
              فتح
            </span>
          </a>
        ))}
      </div>
    </details>
  );
}

export default function PublicStaticShell({ children }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const siteHeaderRef = useRef(null);
  const siteHeaderSpacerRef = useRef(null);
  const mobileHeaderScrollRef = useRef({
    lastY: 0,
    ticking: false,
    away: false,
    revealed: false,
  });
  const mobileMenuOpenRef = useRef(mobileMenuOpen);
  mobileMenuOpenRef.current = mobileMenuOpen;
  const [collapsedGroups, setCollapsedGroups] = useState({
    markets: true,
    services: true,
    account: true,
  });
  const { theme, initialTheme, toggleTheme } = useTheme();
  const mounted = useClientMounted();
  const shellThemeLabelSource = mounted ? theme : initialTheme;
  const mobileThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { mobile: true });
  const sidebarThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource);
  const headerThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { compact: true });

  const toggleMenuGroup = useCallback((groupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  const setMobileHeaderSpacer = useCallback((active) => {
    const header = siteHeaderRef.current;
    const spacer = siteHeaderSpacerRef.current;
    if (!header || !spacer) return;

    spacer.style.height = active ? `${header.getBoundingClientRect().height}px` : "0px";
  }, []);

  const applyMobileHeaderScrollClasses = useCallback(
    (away, revealed) => {
      const header = siteHeaderRef.current;
      if (!header) return;

      const nextAway = Boolean(away);
      const nextRevealed = Boolean(revealed);
      const state = mobileHeaderScrollRef.current;

      if (state.away === nextAway && state.revealed === nextRevealed) {
        return;
      }

      if (nextAway && !state.away) {
        setMobileHeaderSpacer(true);
      } else if (!nextAway && state.away) {
        setMobileHeaderSpacer(false);
      }

      state.away = nextAway;
      state.revealed = nextRevealed;
      header.classList.toggle("site-top-header--away", nextAway);
      header.classList.toggle("site-top-header--revealed", nextAway && nextRevealed);
    },
    [setMobileHeaderSpacer]
  );

  useEffect(() => {
    const header = siteHeaderRef.current;
    const spacer = siteHeaderSpacerRef.current;
    if (!header || !spacer || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => {
      if (mobileHeaderScrollRef.current.away) {
        spacer.style.height = `${header.getBoundingClientRect().height}px`;
      }
    });

    observer.observe(header);

    return () => {
      observer.disconnect();
      spacer.style.height = "0px";
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(MOBILE_HEADER_SCROLL_MQ);
    const state = mobileHeaderScrollRef.current;

    const syncMobileHeaderScroll = () => {
      if (!mediaQuery.matches) {
        applyMobileHeaderScrollClasses(false, false);
        return;
      }

      if (mobileMenuOpenRef.current) {
        applyMobileHeaderScrollClasses(true, true);
        state.lastY = window.scrollY;
        return;
      }

      const y = window.scrollY;

      if (y <= MOBILE_HEADER_TOP_THRESHOLD_PX) {
        applyMobileHeaderScrollClasses(false, false);
        state.lastY = y;
        return;
      }

      const delta = y - state.lastY;

      if (Math.abs(delta) >= MOBILE_HEADER_DIRECTION_DELTA_PX) {
        applyMobileHeaderScrollClasses(true, delta < 0);
      } else if (!state.away) {
        applyMobileHeaderScrollClasses(true, false);
      }

      state.lastY = y;
    };

    const onScroll = () => {
      if (state.ticking) return;

      state.ticking = true;
      window.requestAnimationFrame(() => {
        state.ticking = false;
        syncMobileHeaderScroll();
      });
    };

    const onMediaQueryChange = () => {
      if (!mediaQuery.matches) {
        applyMobileHeaderScrollClasses(false, false);
        return;
      }

      state.lastY = window.scrollY;
      syncMobileHeaderScroll();
    };

    state.lastY = window.scrollY;
    syncMobileHeaderScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    mediaQuery.addEventListener("change", onMediaQueryChange);

    return () => {
      window.removeEventListener("scroll", onScroll);
      mediaQuery.removeEventListener("change", onMediaQueryChange);
      applyMobileHeaderScrollClasses(false, false);
    };
  }, [applyMobileHeaderScrollClasses]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (mobileMenuOpen) {
      applyMobileHeaderScrollClasses(true, true);
      return undefined;
    }

    const y = window.scrollY;
    mobileHeaderScrollRef.current.lastY = y;

    if (y <= MOBILE_HEADER_TOP_THRESHOLD_PX) {
      applyMobileHeaderScrollClasses(false, false);
    } else {
      applyMobileHeaderScrollClasses(true, false);
    }

    return undefined;
  }, [mobileMenuOpen, applyMobileHeaderScrollClasses]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    mobileHeaderScrollRef.current.lastY = window.scrollY;
    applyMobileHeaderScrollClasses(false, false);
  }, [pathname, applyMobileHeaderScrollClasses]);

  useEffect(() => {
    if (!mobileMenuOpen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  const sidebarNavProps = {
    authResolved: true,
    currentUser: null,
    collapsedGroups,
    onToggleGroup: toggleMenuGroup,
  };

  return (
    <div className="min-h-screen lg:flex lg:flex-row bg-[radial-gradient(circle_at_18%_8%,rgba(11,99,255,0.28),transparent_28%),radial-gradient(circle_at_82%_24%,rgba(34,211,238,0.12),transparent_28%),linear-gradient(135deg,#020617,#06112b)] pt-0">
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[9998] lg:hidden">
          <button
            aria-label="إغلاق القائمة"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التنقل"
            className="site-sidebar-panel absolute right-0 top-0 flex h-full w-[86%] max-w-[340px] flex-col overflow-hidden border-l border-cyan-300/20 bg-[#020817] p-4 shadow-[0_0_80px_rgba(0,102,255,0.30)]"
          >
            <div className="site-sidebar-decor pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
            <div className="site-sidebar-decor pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

            <div className="site-sidebar-mobile-header relative z-10 mb-4 flex items-start gap-2">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="site-sidebar-brand-card site-sidebar-brand-card--mobile flex min-w-0 flex-1 items-center justify-between gap-3 p-3"
              >
                <div className="site-sidebar-brand-copy min-w-0">
                  <h2 className="site-sidebar-brand-title font-black leading-5 tracking-tight" dir="ltr">
                    HasaN CharT World
                  </h2>
                  <p className="site-sidebar-brand-subtitle text-xs">منصة التداول الذكية</p>
                </div>
                <div className="site-sidebar-brand-badge grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
                  <span className="site-sidebar-brand-badge__text font-black">HC</span>
                </div>
              </Link>

              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setMobileMenuOpen(false)}
                className="site-sidebar-close-btn grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xl font-black text-white"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <nav className="relative z-10 flex-1 space-y-3 overflow-y-auto pr-1 pl-1 customScroll">
              {renderSidebarGroups({
                ...sidebarNavProps,
                onNavigate: () => setMobileMenuOpen(false),
                variant: "mobile",
              })}
            </nav>

            <div className="sidebarUserCard relative z-10 mt-4 space-y-3 rounded-[24px] border border-cyan-300/10 bg-white/[0.035] p-4 backdrop-blur-xl">
              <button
                onClick={toggleTheme}
                className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
              >
                {mobileThemeLabel}
              </button>

              <AuthLoginLink
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]"
              />
            </div>
          </aside>
        </div>
      )}

      <aside className="site-sidebar-panel relative z-[110] hidden lg:flex w-[292px] shrink-0 h-screen sticky top-0 overflow-hidden bg-[#020817] border-l border-cyan-300/20 shadow-[0_0_80px_rgba(0,102,255,0.24)] backdrop-blur-2xl p-4 flex-col">
        <div className="site-sidebar-decor pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
        <div className="site-sidebar-decor pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <Link href="/" className="site-sidebar-brand-card relative z-10 mb-6 flex items-center gap-3 p-3 group">
          <div className="site-sidebar-brand-badge h-12 w-12 relative grid place-items-center overflow-hidden rounded-2xl">
            <span className="site-sidebar-brand-badge__text font-black text-lg">HC</span>
          </div>
          <div>
            <h2 className="site-sidebar-brand-title font-black text-base leading-5 tracking-tight">HasaN CharT World</h2>
            <p className="site-sidebar-brand-subtitle text-xs">Trading Intelligence</p>
          </div>
        </Link>

        <nav className="relative z-10 flex-1 space-y-3 overflow-y-auto pr-1 pl-1 customScroll">
          {renderSidebarGroups({
            ...sidebarNavProps,
            onNavigate: undefined,
            variant: "desktop",
          })}
          <ContactSection />
        </nav>

        <div className="relative z-10 mt-4 sidebarUserCard rounded-[24px] p-4 border border-cyan-300/10 bg-white/[0.035] backdrop-blur-xl">
          <button
            onClick={toggleTheme}
            className="mb-3 w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
          >
            {sidebarThemeLabel}
          </button>

          <AuthLoginLink className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]" />
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-x-hidden">
        <div ref={siteHeaderSpacerRef} className="site-top-header-spacer lg:hidden" aria-hidden="true" />
        <header
          ref={siteHeaderRef}
          className="site-top-header sticky top-0 z-40 overflow-visible px-4 md:px-6 py-4 backdrop-blur-2xl"
        >
          <div className="site-top-header__gradient pointer-events-none absolute inset-0" />
          <div className="site-top-header__row relative z-10 flex min-w-0 w-full items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="site-header-menu-btn shrink-0 lg:hidden"
              aria-label="فتح القائمة"
            >
              <span aria-hidden="true">⋮</span>
            </button>
            <div className="site-top-header__brand-group min-w-0">
              <Link
                href="/"
                dir="ltr"
                className="site-header-brand font-black flex min-w-0 flex-1 basis-0 items-center gap-1 overflow-hidden sm:gap-2 sm:text-lg md:flex-initial md:basis-auto md:overflow-visible lg:flex-none lg:shrink-0"
              >
                <span aria-hidden="true" className="site-header-logo-badge shrink-0 font-black">
                  HC
                </span>
                <span className="site-header-brand__text site-header-brand__text--primary">HasaN CharT</span>
                <span className="site-header-brand__text site-header-brand__text--suffix hidden md:inline">
                  {" "}
                  World
                </span>
              </Link>
            </div>

            <div className="site-top-header__actions flex shrink-0 items-center">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={headerThemeLabel}
                className="site-header-theme-btn site-header-theme-btn--compact"
              >
                <span className="site-header-theme-btn__icon sm:hidden" aria-hidden="true">
                  {shellThemeLabelSource === "dark" ? "☀️" : "🌙"}
                </span>
                <span className="hidden sm:inline">{headerThemeLabel}</span>
              </button>

              <AuthLoginLink className="topLoginBtn topLoginBtn--compact shrink-0" compact />
            </div>
          </div>
        </header>

        <MemoizedLayoutPageSlot>{children}</MemoizedLayoutPageSlot>
      </div>
    </div>
  );
}
