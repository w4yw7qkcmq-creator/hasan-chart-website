"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { scheduleAfterPaint } from "../../lib/schedule-after-paint";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import { resolveSupabaseAuthUser } from "../../lib/auth-session-client";
import { useAppModal } from "./AppModalProvider";
import { useAuth } from "./AuthProvider";
import { useBootstrapLoadingOverlay } from "../hooks/useBootstrapLoadingOverlay";
import { useClientMounted } from "../hooks/useClientMounted";
import { useNotifications } from "./notifications/NotificationProvider";
import { useTheme } from "./ThemeProvider";
import {
  PUSH_ENROLLMENT,
  pushEnrollmentCompactUi,
} from "../../lib/push-enrollment-state.js";

function BrowserPushHeaderButton({ ui, onClick }) {
  return (
    <button
      type="button"
      aria-label={ui.ariaLabel}
      title={ui.title}
      disabled={ui.disabled}
      onClick={onClick}
      className={`browserPushBell shrink-0 ${ui.active ? "browserPushBell--active" : ""} ${
        ui.variant === "unsupported" ? "browserPushBell--unsupported" : ""
      }`}
    >
      <span className="browserPushBell__icon" aria-hidden="true">
        🔔
      </span>
      {ui.badge === "checking" ? (
        <span className="browserPushBell__badge browserPushBell__badge--checking" aria-hidden="true" />
      ) : ui.badge ? (
        <span className={`browserPushBell__badge browserPushBell__badge--${ui.badge}`} aria-hidden="true">
          {ui.badgeSymbol}
        </span>
      ) : null}
    </button>
  );
}

const NotificationBell = dynamic(
  () => import("./notifications/NotificationBell").then((mod) => mod.NotificationBell),
  {
    ssr: false,
    loading: () => (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5"
        aria-hidden="true"
      />
    ),
  }
);

const menuGroups = [
  {
    id: "markets",
    label: "الأسواق",
    icon: "📊",
    defaultOpen: true,
    items: [
      { href: "/", icon: "🏠", label: "الرئيسية" },
      { href: "/#market-windows", icon: "▣", label: "نوافذ السوق" },
      { href: "/#prices", icon: "📊", label: "الأسعار المباشرة" },
      { href: "/#chart", icon: "📈", label: "الشارت الحي" },
      { href: "/news", icon: "📰", label: "الأخبار" },
      { href: "/assets", icon: "🗂️", label: "الأصول والأسواق" },
      { href: "/order-book", icon: "📒", label: "دفتر الأوامر والسيولة" },
      { href: "/daily-analysis", icon: "📝", label: "التحليلات اليومية" },
      { href: "/academy", icon: "🎓", label: "HasaN CharT Academy" },
      { href: "/results", icon: "🏆", label: "HasaN CharT Result" },
    ],
  },
  {
    id: "services",
    label: "الخدمات",
    icon: "💼",
    defaultOpen: true,
    items: [
      { href: "/#analysis", icon: "🧠", label: "طلب تحليل عملة" },
      { href: "/#alerts", icon: "🔔", label: "تنبيه سعر" },
      { href: "/subscriptions", icon: "💎", label: "الاشتراكات" },
      { href: "/vip-spot", icon: "⭐", label: "توصيات VIP سبوت", auth: true, plan: "spot" },
      { href: "/vip-futures", icon: "🔥", label: "توصيات VIP فيوتشر", auth: true, plan: "futures" },
      { href: "/account-management", icon: "📂", label: "إدارة الحسابات" },
      { href: "/partner-center", icon: "🤝", label: "برنامج الشركاء" },
    ],
  },
  {
    id: "account",
    label: "الحساب",
    icon: "👤",
    defaultOpen: true,
    items: [
      { href: "/my-dashboard", icon: "👤", label: "لوحة المستخدم", auth: true },
      { href: "/my-dashboard#instant-analysis", icon: "📈", label: "تحليل لحظي", auth: true },
      { href: "/my-analysis", icon: "📩", label: "طلباتي وردود الإدارة", auth: true },
      { href: "/notification-settings", icon: "🔔", label: "إعدادات الإشعارات", auth: true },
    ],
  },
  {
    id: "admin",
    label: "الإدارة",
    icon: "🛠",
    adminOnly: true,
    defaultOpen: false,
    items: [{ href: "/admin", icon: "🛠", label: "لوحة الإدارة", adminOnly: true }],
  },
];

const HEAVY_PREFETCH_ROUTES = new Set([
  "/partner-center",
  "/subscriptions",
  "/my-dashboard",
  "/my-analysis",
  "/vip-spot",
  "/vip-futures",
  "/account-management",
  "/admin",
  "/daily-analysis",
  "/news",
  "/assets",
]);

function shouldPrefetchSidebarHref(href) {
  const path = String(href || "").split("#")[0];
  return !HEAVY_PREFETCH_ROUTES.has(path);
}

const socialLinks = [
  { label: "الدعم الفني", badge: "تليجرام", icon: "🛟", href: "https://t.me/HasaNCharTSupport" },
  { label: "القناة الرسمية", badge: "تليجرام", icon: "📢", href: "https://t.me/HsaNCharT" },
  { label: "د. حسن", badge: "تليجرام", icon: "👨‍🏫", href: "https://t.me/CEOHasaNCharT" },
  { label: "منصة إكس", badge: "إكس", icon: "𝕏", href: "https://x.com/HasanChart" },
];

function getPlanAccess(subscriptionPlan) {
  const text = String(subscriptionPlan || "").toLowerCase();

  return {
    hasSpot: text.includes("spot") || text.includes("سبوت") || text.includes("vip spot"),
    hasFutures:
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures"),
  };
}

function getUserPlanAccess(user) {
  if (typeof user?.hasSpot === "boolean" && typeof user?.hasFutures === "boolean") {
    return { hasSpot: user.hasSpot, hasFutures: user.hasFutures };
  }

  return getPlanAccess(user?.subscription_plan);
}

function hasActiveSubscriptionStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "نشط" || normalized === "active" || normalized === "مفعل";
}

function AuthAccountSkeleton({ compact = false }) {
  if (compact) {
    return (
      <div className="hidden sm:flex items-center gap-3" aria-hidden="true">
        <div className="h-10 w-24 animate-pulse rounded-2xl bg-white/10" />
        <div className="h-10 w-24 animate-pulse rounded-2xl bg-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-2xl bg-white/10" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-36 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="h-11 w-full animate-pulse rounded-2xl bg-white/10" />
    </div>
  );
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

  const hasActiveSubscription = hasActiveSubscriptionStatus(currentUser?.subscription_status);
  const { hasSpot: hasSpotPlan, hasFutures: hasFuturesPlan } = getUserPlanAccess(currentUser);

  if (item.plan === "spot" && (!hasActiveSubscription || !hasSpotPlan)) {
    return "hidden";
  }

  if (item.plan === "futures" && (!hasActiveSubscription || !hasFuturesPlan)) {
    return "hidden";
  }

  return "visible";
}

const sidebarMenuItemClass =
  "group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-cyan-300/15 bg-white/[0.045] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-cyan-300/45 hover:bg-gradient-to-l hover:from-blue-600/85 hover:via-cyan-500/45 hover:to-white/10";

const sidebarMenuItemDesktopClass = `${sidebarMenuItemClass} hover:-translate-x-1 hover:shadow-[0_16px_38px_rgba(0,102,255,0.28)]`;

function SidebarMenuItem({
  item,
  state,
  authResolved,
  currentUser,
  unreadAnalysisCount = 0,
  onNavigate,
  variant = "desktop",
}) {
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
      {item.href === "/my-analysis" && unreadAnalysisCount > 0 && (
        <span className="mr-auto grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
          {unreadAnalysisCount > 9 ? "9+" : unreadAnalysisCount}
        </span>
      )}
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
      ? "flex min-h-[48px] cursor-pointer list-none items-center gap-3 rounded-[16px] border border-cyan-300/10 bg-white/[0.03] px-3 py-2.5 text-white transition hover:border-cyan-300/30 hover:bg-white/[0.06]"
      : "flex min-h-[48px] cursor-pointer list-none items-center gap-3 rounded-[16px] border border-cyan-300/10 bg-white/[0.03] px-3 py-2.5 text-white transition hover:border-cyan-300/30 hover:bg-white/[0.06]";

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
  unreadAnalysisCount,
  isAdmin,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
  variant = "desktop",
}) {
  return menuGroups.map((group) => {
    if (group.adminOnly && authResolved && !isAdmin) {
      return null;
    }

    const isOpen = collapsedGroups[group.id] ?? group.defaultOpen;

    const items = group.items
      .map((item) => {
        const state = resolveMenuItemState(item, authResolved, currentUser);

        if (item.adminOnly && authResolved && !isAdmin) {
          return null;
        }

        return (
          <SidebarMenuItem
            key={item.href}
            item={item}
            state={state}
            authResolved={authResolved}
            currentUser={currentUser}
            unreadAnalysisCount={unreadAnalysisCount}
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

function AdminMenuSection({ authResolved, isAdmin, onNavigate, variant = "desktop" }) {
  const sessionPending = !authResolved;

  if (!sessionPending && !isAdmin) {
    return null;
  }

  const adminLinkClass =
    variant === "desktop"
      ? "group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-x-1 hover:border-emerald-300/45 hover:bg-gradient-to-l hover:from-emerald-500/65 hover:to-cyan-400/20"
      : "group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-emerald-300/45 hover:bg-gradient-to-l hover:from-emerald-500/65 hover:to-cyan-400/20";

  return (
    <>
      <div className="my-3 border-t border-cyan-300/15" />
      {sessionPending ? (
        <div
          className={`${adminLinkClass} pointer-events-none cursor-wait opacity-60`}
          aria-hidden="true"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 animate-pulse">
            🛠
          </span>
          <span className="h-4 w-28 animate-pulse rounded bg-white/20" />
        </div>
      ) : (
        <Link href="/admin" onClick={onNavigate} className={adminLinkClass}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10">
            🛠
          </span>
          <span className="font-bold leading-none">لوحة الإدارة</span>
        </Link>
      )}
    </>
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

function RootLayoutShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { showAppModal } = useAppModal();
  const { user: currentUser, status: authStatus, authResolved, isAdmin, logout, updateUser } = useAuth();
  const [globalNotice, setGlobalNotice] = useState("");
  const [globalNoticeHref, setGlobalNoticeHref] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [webPushEnabled, setWebPushEnabled] = useState(false);
  const [pushEnrollment, setPushEnrollment] = useState(null);
  const [pushEnrollmentChecking, setPushEnrollmentChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({
    markets: true,
    services: true,
    account: true,
    admin: false,
  });
  const { unreadAnalysisCount } = useNotifications();
  const { theme, initialTheme, toggleTheme } = useTheme();
  const mounted = useClientMounted();
  const shellUser = mounted ? currentUser : null;
  const shellAuthResolved = mounted ? authResolved : false;
  const authLoading = !mounted || !authResolved;
  const shellNotificationPermission = mounted ? notificationPermission : "default";
  const shellWebPushEnabled = mounted ? webPushEnabled : false;
  const shellPushEnrollmentChecking = !mounted || pushEnrollmentChecking;
  const browserPushCompactUi = pushEnrollmentCompactUi(
    pushEnrollment || PUSH_ENROLLMENT.PROMPT,
    { checking: shellPushEnrollmentChecking }
  );
  const shellIsAdmin = mounted ? isAdmin : false;
  const shellUnreadAnalysisCount = mounted ? unreadAnalysisCount : 0;
  const shellThemeLabelSource = mounted ? theme : initialTheme;
  const mobileThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { mobile: true });
  const sidebarThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource);
  const headerThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { compact: true });
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const toggleMenuGroup = useCallback((groupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  const refreshPushEnrollmentState = useCallback(async () => {
    if (typeof window === "undefined") return null;

    const { resolvePushEnrollmentState, setStoredPushEndpoint } = await import("../../lib/push-client");
    const browserState = await resolvePushEnrollmentState();

    setPushEnrollment(browserState.enrollment);
    setNotificationPermission(browserState.permission);
    setWebPushEnabled(browserState.isEnrolled);

    if (browserState.isEnrolled && browserState.subscription?.endpoint) {
      setStoredPushEndpoint(browserState.subscription.endpoint);
    } else {
      setStoredPushEndpoint("");
    }

    setPushEnrollmentChecking(false);
    return browserState;
  }, []);

  const { overlay: bootstrapOverlay, stallBanner: bootstrapStallBanner } =
    useBootstrapLoadingOverlay(authResolved, { enabled: !isAuthPage });

  useEffect(() => {
    if (!mobileMenuOpen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let active = true;

    const cancelDeferred = scheduleAfterPaint(() => {
      void import("../../lib/push-client").then(({ resolvePushEnrollmentState, setStoredPushEndpoint }) => {
        void (async () => {
          const browserState = await resolvePushEnrollmentState();
          if (!active) return;

          setPushEnrollment(browserState.enrollment);
          setNotificationPermission(browserState.permission);
          setPushEnrollmentChecking(false);

          if (browserState.isEnrolled) {
            setWebPushEnabled(true);

            const endpoint = browserState.subscription?.endpoint;
            if (endpoint) {
              setStoredPushEndpoint(endpoint);
            }

            console.log(
              "push:ui:enabled",
              JSON.stringify({
                source: "browser_subscription",
                hasEndpoint: Boolean(endpoint),
              })
            );
          } else {
            setWebPushEnabled(false);
          }
        })();
      });
    }, 2000);

    return () => {
      active = false;
      cancelDeferred();
    };
  }, []);

  useEffect(() => {
    const cancelDeferred = scheduleAfterPaint(() => {
      void import("../../lib/notification-sound-manager").then(({ setupBrowserSoundUnlock }) => {
        setupBrowserSoundUnlock();
      });
    }, 1800);

    return cancelDeferred;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;

    const cancelDeferred = scheduleAfterPaint(() => {
      void import("../../lib/push-client").then(({ ensureServiceWorkerRegistration }) => {
        ensureServiceWorkerRegistration().catch((err) => {
          console.warn("Service worker registration skipped:", err?.message || err);
        });
      });
    }, 2500);

    return cancelDeferred;
  }, []);

  const savePushSubscription = async ({ existingSubscription = null } = {}) => {
    const pushClient = await import("../../lib/push-client");

    console.log(
      "push:client:start",
      JSON.stringify({
        phase: "savePushSubscription",
      })
    );

    const { user: authUser, error: authError } = await resolveSupabaseAuthUser();

    if (authError || !authUser?.id || !authUser?.email) {
      console.error(
        "push:api:error",
        JSON.stringify({
          phase: "client",
          reason: "MISSING_AUTH_USER",
          authError: authError?.message || null,
        })
      );
      throw new Error("يجب تسجيل الدخول قبل حفظ اشتراك الإشعارات");
    }

    let subscription = existingSubscription;

    if (!subscription) {
      subscription = await pushClient.getExistingPushSubscription();
    }

    if (!subscription) {
      try {
        subscription = await pushClient.subscribeToWebPush();
      } catch (error) {
        console.error(
          "push:api:error",
          JSON.stringify({
            phase: "web_push_subscribe",
            message: error?.message || String(error),
          })
        );
        throw new Error(
          error?.message || "تعذر إنشاء اشتراك Web Push من المتصفح"
        );
      }
    }

    const payload = pushClient.serializePushSubscription(subscription);

    if (!payload?.endpoint || !payload?.keys?.p256dh || !payload?.keys?.auth) {
      throw new Error("تعذر قراءة بيانات اشتراك Push من المتصفح");
    }

    const anonymousId = pushClient.getAnonymousPushId();
    const result = await pushClient.savePushSubscriptionViaApi({
      subscription: payload,
      anonymousId,
      userEmail: String(authUser.email).trim().toLowerCase(),
      userId: String(authUser.id).trim(),
    });

    pushClient.setStoredPushEndpoint(payload.endpoint);
    setWebPushEnabled(true);

    return {
      apiCalled: true,
      subscription: result.subscription,
    };
  };

  useEffect(() => {
    if (!globalNotice) return;

    const timer = setTimeout(() => {
      setGlobalNotice("");
      setGlobalNoticeHref("");
    }, 9000);

    return () => clearTimeout(timer);
  }, [globalNotice]);

  const enableBrowserNotifications = async () => {
    console.log(
      "push:client:start",
      JSON.stringify({
        phase: "enableBrowserNotifications",
      })
    );

    if (typeof window === "undefined") return;

    if (!authResolved || !currentUser?.email || !currentUser?.id) {
      showAppModal({
        type: "warning",
        title: "تسجيل الدخول مطلوب",
        message: "يجب تسجيل الدخول قبل تفعيل إشعارات المتصفح.",
      });
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushEnrollment(PUSH_ENROLLMENT.UNSUPPORTED);
      showAppModal({
        type: "warning",
        title: "الإشعارات غير مدعومة",
        message: "المتصفح لا يدعم Web Push Notifications",
      });
      return;
    }

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      showAppModal({
        type: "warning",
        title: "إعدادات الإشعارات ناقصة",
        message: "مفتاح VAPID العام غير مُعد على السيرفر.",
      });
      return;
    }

    if (Notification.permission === "denied") {
      setPushEnrollment(PUSH_ENROLLMENT.DENIED);
      setNotificationPermission("denied");
      setWebPushEnabled(false);
      showAppModal({
        type: "warning",
        title: "إشعارات المتصفح محظورة",
        message: "إشعارات المتصفح محظورة من إعدادات المتصفح. فعّلها يدوياً من إعدادات المتصفح ثم أعد المحاولة.",
      });
      return;
    }

    try {
      const { resolvePushEnrollmentState, setStoredPushEndpoint } = await import("../../lib/push-client");
      const browserState = await resolvePushEnrollmentState();
      setPushEnrollment(browserState.enrollment);
      setNotificationPermission(browserState.permission);

      if (browserState.isEnrolled) {
        if (browserState.subscription?.endpoint) {
          setStoredPushEndpoint(browserState.subscription.endpoint);
        }

        if (authResolved && currentUser?.email && currentUser?.id) {
          try {
            await savePushSubscription({
              existingSubscription: browserState.subscription,
            });
            await refreshPushEnrollmentState();
            showAppModal({
              type: "success",
              title: "إشعارات المتصفح",
              message: "تم التحقق من اشتراك الإشعارات وحفظه.",
            });
            return;
          } catch (syncError) {
            setWebPushEnabled(false);
            setPushEnrollment(PUSH_ENROLLMENT.NEEDS_REENABLE);
            console.warn(
              "Push subscription sync failed:",
              syncError?.message || syncError
            );
            showAppModal({
              type: "warning",
              title: "إشعارات المتصفح تحتاج إعادة تفعيل",
              message:
                "الإذن مفعّل لكن الاشتراك غير محفوظ. اضغط زر إشعارات المتصفح لإكمال الإعداد.",
            });
            return;
          }
        }

        await refreshPushEnrollmentState();
        showAppModal({
          type: "success",
          title: "إشعارات المتصفح",
          message: "الإشعارات مفعّلة على هذا المتصفح.",
        });
        return;
      }

      if (browserState.needsReenable) {
        setWebPushEnabled(false);
        setPushEnrollment(PUSH_ENROLLMENT.NEEDS_REENABLE);
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== "granted") {
        setPushEnrollment(
          permission === "denied" ? PUSH_ENROLLMENT.DENIED : PUSH_ENROLLMENT.PROMPT
        );
        showAppModal({
          type: "warning",
          title: "تم رفض الإشعارات",
          message: "تم رفض إشعارات المتصفح. يمكنك تفعيلها لاحقاً من إعدادات المتصفح.",
        });
        return;
      }

      const saveResult = await savePushSubscription();

      if (!saveResult?.apiCalled || !saveResult?.subscription?.id) {
        throw new Error("لم يتم استدعاء /api/push/subscribe بنجاح");
      }

      showAppModal({
        type: "success",
        title: "تم تفعيل إشعارات المتصفح",
        message:
          "تم حفظ اشتراك الإشعارات في قاعدة البيانات. ستصلك تنبيهات الأسعار حتى لو كان الموقع مغلقاً.",
      });

      setGlobalNotice("🔔 تم حفظ اشتراك إشعارات المتصفح بنجاح");
      setGlobalNoticeHref("");

      await refreshPushEnrollmentState();

      console.log(
        "push:ui:enabled",
        JSON.stringify({
          source: "button_new_subscription",
        })
      );
    } catch (error) {
      setWebPushEnabled(false);
      setPushEnrollment(PUSH_ENROLLMENT.PROMPT);
      void import("../../lib/push-client").then(({ setStoredPushEndpoint }) => {
        setStoredPushEndpoint("");
      });

      showAppModal({
        type: "warning",
        title: "تعذر تفعيل الإشعارات",
        message: error?.message || "حاول مرة أخرى من إعدادات المتصفح.",
      });
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!authResolved || !currentUser?.email || !currentUser?.id) return undefined;

    let active = true;

    const cancelDeferred = scheduleAfterPaint(() => {
      if (!active) return;

      void import("../../lib/push-client").then(({ resolvePushEnrollmentState, setStoredPushEndpoint }) => {
        void (async () => {
          const browserState = await resolvePushEnrollmentState();
          if (!active) return;

          setPushEnrollment(browserState.enrollment);
          setNotificationPermission(browserState.permission);
          setPushEnrollmentChecking(false);

          if (!browserState.isEnrolled) {
            setWebPushEnabled(false);
            return;
          }

          setWebPushEnabled(true);

          if (browserState.subscription?.endpoint) {
            setStoredPushEndpoint(browserState.subscription.endpoint);
          }

          console.log(
            "push:ui:enabled",
            JSON.stringify({
              source: "login_sync",
              email: currentUser.email,
              userId: currentUser.id,
            })
          );

          try {
            const saved = await savePushSubscription({
              existingSubscription: browserState.subscription,
            });

            if (!active) return;

            if (saved?.apiCalled && saved?.subscription?.id) {
              console.log("PUSH_SUBSCRIPTION_LINK_ON_LOGIN_DONE", {
                subscriptionId: saved.subscription.id,
                email: saved.subscription.email || currentUser.email,
                userId: saved.subscription.user_id || currentUser.id,
              });
            }
          } catch (err) {
            if (!active) return;
            console.warn("Push subscription sync skipped:", err?.message || err);
          }
        })();
      });
    }, 3000);

    return () => {
      active = false;
      cancelDeferred();
    };
  }, [authResolved, currentUser?.email, currentUser?.id]);

  const refreshCurrentUserSubscription = useCallback(async () => {
    if (!currentUser?.email || (typeof document !== "undefined" && document.hidden)) {
      return;
    }

    try {
      const response = await fetchWithTimeout(
        "/api/my-subscription-status",
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        },
        5000
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success || !result?.active) {
        return;
      }

      const activePlanText = result.subscription_plan || "اشتراكك";
      const activationNoticeKey = `subscriptionActivationNotice-${currentUser.email}-${activePlanText}`;
      const alreadyNotified = localStorage.getItem(activationNoticeKey) === "yes";

      updateUser((prev) => {
        if (!prev) return prev;

        const wasInactive = !["نشط", "active", "مفعل"].includes(
          String(prev.subscription_status || "").toLowerCase()
        );

        if ((wasInactive || !alreadyNotified) && !alreadyNotified) {
          localStorage.setItem(activationNoticeKey, "yes");
        }

        return {
          ...prev,
          subscription_plan: activePlanText,
          subscription_status: result.subscription_status || "مفعل",
          hasSpot: Boolean(result.hasSpot),
          hasFutures: Boolean(result.hasFutures),
        };
      });
    } catch (err) {
      console.warn("Subscription refresh skipped:", err?.message || err);
    }
  }, [currentUser?.email, updateUser]);

  // Refresh subscription on login, tab focus, or realtime admin activation — no fast polling loop.
  useEffect(() => {
    if (!authResolved || !currentUser?.email) return undefined;

    let active = true;
    let channel = null;

    const runRefresh = () => {
      if (!active || document.hidden) return;
      void refreshCurrentUserSubscription();
    };

    const cancelDeferred = scheduleAfterPaint(() => {
      if (!active) return;

      runRefresh();

      void import("../../lib/supabase").then(({ supabase }) => {
        if (!active) return;

        channel = supabase
          .channel(`global-subscription-refresh-${currentUser.email}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "subscription_requests",
              filter: `user_email=eq.${currentUser.email}`,
            },
            (payload) => {
              if (payload?.new?.status === "مفعل") {
                runRefresh();
              }
            }
          )
          .subscribe();
      });
    }, 0);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      cancelDeferred();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const channelToRemove = channel;
      channel = null;

      if (channelToRemove) {
        void import("../../lib/supabase").then(({ supabase }) => {
          supabase.removeChannel(channelToRemove);
        });
      }
    };
  }, [authResolved, currentUser?.email, refreshCurrentUserSubscription]);

  const logoutAndRedirect = async () => {
    await logout();
    window.location.href = "/login";
  };

  if (isAuthPage) {
    return (
      <>
        {globalNotice && (
          <div
            role="status"
            aria-live="polite"
            className="fixed left-5 top-5 z-[9999] max-w-md overflow-hidden rounded-[28px] border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 p-5 text-white shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">{globalNotice}</p>
                <p className="mt-1 text-sm font-bold text-white/90">
                  إذا لم يظهر إشعار المتصفح، فعّل الإشعارات من الزر بالأعلى.
                </p>

                {globalNoticeHref && (
                  <Link
                    href={globalNoticeHref}
                    onClick={() => {
                      setGlobalNotice("");
                      setGlobalNoticeHref("");
                    }}
                    className="mt-3 inline-flex rounded-2xl bg-white/20 px-4 py-2 text-sm font-black text-white transition hover:bg-white/30"
                  >
                    فتح الآن
                  </Link>
                )}
              </div>
              <button
                type="button"
                aria-label="إغلاق الإشعار"
                onClick={() => {
                  setGlobalNotice("");
                  setGlobalNoticeHref("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-black text-white transition hover:bg-white/30"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-white/30">
              <div className="h-full animate-pulse bg-white" />
            </div>
          </div>
        )}
        {children}
        {bootstrapOverlay}
        {bootstrapStallBanner}
      </>
    );
  }

  return (
    <>
        {globalNotice && (
          <div
            role="status"
            aria-live="polite"
            className="fixed left-5 top-5 z-[9999] max-w-md overflow-hidden rounded-[28px] border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 p-5 text-white shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">{globalNotice}</p>
                <p className="mt-1 text-sm font-bold text-white/90">
                  إذا لم يظهر إشعار المتصفح، فعّل الإشعارات من الزر بالأعلى.
                </p>

                {globalNoticeHref && (
                  <Link
                    href={globalNoticeHref}
                    onClick={() => {
                      setGlobalNotice("");
                      setGlobalNoticeHref("");
                    }}
                    className="mt-3 inline-flex rounded-2xl bg-white/20 px-4 py-2 text-sm font-black text-white transition hover:bg-white/30"
                  >
                    فتح الآن
                  </Link>
                )}
              </div>
              <button
                type="button"
                aria-label="إغلاق الإشعار"
                onClick={() => {
                  setGlobalNotice("");
                  setGlobalNoticeHref("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-black text-white transition hover:bg-white/30"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-white/30">
              <div className="h-full animate-pulse bg-white" />
            </div>
          </div>
        )}
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
                className="absolute right-0 top-0 flex h-full w-[86%] max-w-[340px] flex-col overflow-hidden border-l border-cyan-300/20 bg-[#020817] p-4 shadow-[0_0_80px_rgba(0,102,255,0.30)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
                <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

                <div className="site-sidebar-brand-card relative z-10 mb-4 flex items-center justify-between gap-3 p-3">
                  <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                    <div className="site-sidebar-brand-badge grid h-11 w-11 place-items-center rounded-2xl">
                      <span className="site-sidebar-brand-badge__text font-black">HC</span>
                    </div>
                    <div>
                      <h2 className="site-sidebar-brand-title font-black leading-5">HasaN CharT World</h2>
                      <p className="site-sidebar-brand-subtitle text-xs">منصة التداول الذكية</p>
                    </div>
                  </Link>

                  <button
                    type="button"
                    aria-label="إغلاق القائمة"
                    onClick={() => setMobileMenuOpen(false)}
                    className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xl font-black text-white"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>

                <nav className="relative z-10 flex-1 space-y-3 overflow-y-auto pr-1 pl-1 customScroll">
                  {renderSidebarGroups({
                    authResolved: shellAuthResolved,
                    currentUser: shellUser,
                    unreadAnalysisCount: shellUnreadAnalysisCount,
                    isAdmin: shellIsAdmin,
                    collapsedGroups,
                    onToggleGroup: toggleMenuGroup,
                    onNavigate: () => setMobileMenuOpen(false),
                    variant: "mobile",
                  })}
                </nav>

                <div className="relative z-10 mt-4 space-y-3 rounded-[24px] border border-cyan-300/10 bg-white/[0.035] p-4 backdrop-blur-xl">
                  <button
                    onClick={toggleTheme}
                    className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    {mobileThemeLabel}
                  </button>

                  <div className="flex items-center justify-center">
                    <BrowserPushHeaderButton
                      ui={browserPushCompactUi}
                      onClick={() => {
                        void enableBrowserNotifications();
                      }}
                    />
                  </div>

                  {authLoading ? (
                    <AuthAccountSkeleton />
                  ) : shellUser ? (
                    <>
                      <Link href="/my-dashboard" onClick={() => setMobileMenuOpen(false)} className="mb-4 flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-300 font-black shadow-[0_0_25px_rgba(0,163,255,0.35)]">
                          {(shellUser.username || shellUser.email || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold">{shellUser.username || "حسابي"}</p>
                          <p className="truncate text-xs text-cyan-100/50">{shellUser.email}</p>
                        </div>
                      </Link>
                      <button onClick={logoutAndRedirect} className="w-full rounded-2xl border border-red-400/20 bg-red-500/15 px-4 py-3 font-black text-red-100 transition hover:bg-red-500/25">تسجيل الخروج</button>
                    </>
                  ) : (
                    <AuthLoginLink
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]"
                    />
                  )}
                </div>
              </aside>
            </div>
          )}
          <aside className="relative z-[110] hidden lg:flex w-[292px] shrink-0 h-screen sticky top-0 overflow-hidden bg-[#020817] border-l border-cyan-300/20 shadow-[0_0_80px_rgba(0,102,255,0.24)] backdrop-blur-2xl p-4 flex-col">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

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
                authResolved: shellAuthResolved,
                currentUser: shellUser,
                unreadAnalysisCount: shellUnreadAnalysisCount,
                isAdmin: shellIsAdmin,
                collapsedGroups,
                onToggleGroup: toggleMenuGroup,
                onNavigate: undefined,
                variant: "desktop",
              })}

              <details className="group/contact rounded-[18px] border border-cyan-300/15 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 rounded-[18px] px-4 py-3 text-white transition hover:-translate-x-1 hover:border-cyan-300/45 hover:bg-gradient-to-l hover:from-blue-600/85 hover:via-cyan-500/45 hover:to-white/10">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">☎️</span>
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
                    <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07142f]/70 px-3 py-2.5 text-sm transition hover:border-cyan-300/35 hover:bg-cyan-400/10">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/10">{link.icon}</span>
                        <div>
                          <p className="font-bold text-white">{link.label}</p>
                          <p className="text-[11px] text-cyan-100/55">{link.badge}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-100">فتح</span>
                    </a>
                  ))}
                </div>
              </details>
            </nav>

            <div className="relative z-10 mt-4 sidebarUserCard rounded-[24px] p-4 border border-cyan-300/10 bg-white/[0.035] backdrop-blur-xl">
              <button
                onClick={toggleTheme}
                className="mb-3 w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
              >
                {sidebarThemeLabel}
              </button>

              {authLoading ? (
                <AuthAccountSkeleton />
              ) : shellUser ? (
                <>
                  <Link href="/my-dashboard" className="flex items-center gap-3 mb-4">
                    <div className="h-11 w-11 rounded-2xl grid place-items-center bg-gradient-to-br from-blue-600 to-cyan-300 font-black shadow-[0_0_25px_rgba(0,163,255,0.35)]">
                      {(shellUser.username || shellUser.email || "U").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{shellUser.username || "حسابي"}</p>
                      <p className="text-xs text-cyan-100/50 truncate">{shellUser.email}</p>
                    </div>
                  </Link>
                  <button onClick={logoutAndRedirect} className="w-full rounded-2xl bg-red-500/15 border border-red-400/20 px-4 py-3 text-red-100 font-black hover:bg-red-500/25 transition">تسجيل الخروج</button>
                </>
              ) : (
                <AuthLoginLink className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]" />
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-x-hidden">
            <header className="site-top-header sticky top-0 z-40 overflow-visible px-4 md:px-6 py-4 backdrop-blur-2xl">
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
                    <span className="site-header-brand__text site-header-brand__text--primary">
                      HasaN CharT
                    </span>
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

                  <BrowserPushHeaderButton
                    ui={browserPushCompactUi}
                    onClick={() => {
                      void enableBrowserNotifications();
                    }}
                  />

                  {authLoading ? (
                    <div
                      className="hidden h-9 w-9 shrink-0 animate-pulse rounded-2xl bg-white/10 sm:grid sm:h-11 sm:w-11"
                      aria-hidden="true"
                    />
                  ) : shellUser ? (
                    <NotificationBell className="relative shrink-0" />
                  ) : null}

                  {authLoading ? (
                    <AuthAccountSkeleton compact />
                  ) : shellUser ? (
                    <div className="hidden sm:flex items-center gap-3 min-w-0">
                      <Link
                        href="/my-dashboard"
                        className="topUserChip"
                        title={shellUser.username || shellUser.email || "حسابي"}
                      >
                        {shellUser.username || shellUser.email || "حسابي"}
                      </Link>
                      <button type="button" onClick={logoutAndRedirect} className="topLogoutBtn" aria-label="تسجيل الخروج">
                        تسجيل الخروج
                      </button>
                    </div>
                  ) : (
                    <AuthLoginLink className="topLoginBtn topLoginBtn--compact shrink-0" compact />
                  )}
                </div>
              </div>
            </header>

            <MemoizedLayoutPageSlot>{children}</MemoizedLayoutPageSlot>
          </div>
        </div>
        {bootstrapOverlay}
        {bootstrapStallBanner}
    </>
  );
}

export default RootLayoutShell;
