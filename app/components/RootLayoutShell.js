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
import { ui } from "./ui/ui-theme";
const NotificationBell = dynamic(
  () =>
    import("./notifications/NotificationBell").then(
      (mod) => mod.NotificationBell,
    ),
  {
    ssr: false,
    loading: () => (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl site-shell-skeleton"
        aria-hidden="true"
      />
    ),
  },
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
      {
        href: "/vip-spot",
        icon: "⭐",
        label: "توصيات VIP سبوت",
        auth: true,
        plan: "spot",
      },
      {
        href: "/vip-futures",
        icon: "🔥",
        label: "توصيات VIP فيوتشر",
        auth: true,
        plan: "futures",
      },
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
      {
        href: "/my-dashboard#instant-analysis",
        icon: "📈",
        label: "تحليل لحظي",
        auth: true,
      },
      {
        href: "/my-analysis",
        icon: "📩",
        label: "طلباتي وردود الإدارة",
        auth: true,
      },
      {
        href: "/notification-settings",
        icon: "🔔",
        label: "إعدادات الإشعارات",
        auth: true,
      },
    ],
  },
  {
    id: "admin",
    label: "الإدارة",
    icon: "🛠",
    adminOnly: true,
    defaultOpen: false,
    items: [
      { href: "/admin", icon: "🛠", label: "لوحة الإدارة", adminOnly: true },
    ],
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
  {
    label: "الدعم الفني",
    badge: "تليجرام",
    icon: "🛟",
    href: "https://t.me/HasaNCharTSupport",
  },
  {
    label: "القناة الرسمية",
    badge: "تليجرام",
    icon: "📢",
    href: "https://t.me/HsaNCharT",
  },
  {
    label: "د. حسن",
    badge: "تليجرام",
    icon: "👨‍🏫",
    href: "https://t.me/CEOHasaNCharT",
  },
  {
    label: "منصة إكس",
    badge: "إكس",
    icon: "𝕏",
    href: "https://x.com/HasanChart",
  },
];
function getPlanAccess(subscriptionPlan) {
  const text = String(subscriptionPlan || "").toLowerCase();
  return {
    hasSpot:
      text.includes("spot") ||
      text.includes("سبوت") ||
      text.includes("vip spot"),
    hasFutures:
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures"),
  };
}
function getUserPlanAccess(user) {
  if (
    typeof user?.hasSpot === "boolean" &&
    typeof user?.hasFutures === "boolean"
  ) {
    return { hasSpot: user.hasSpot, hasFutures: user.hasFutures };
  }
  return getPlanAccess(user?.subscription_plan);
}
function hasActiveSubscriptionStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized === "نشط" || normalized === "active" || normalized === "مفعل"
  );
}
function AuthAccountSkeleton({ compact = false }) {
  if (compact) {
    return (
      <div className="hidden sm:flex items-center gap-3" aria-hidden="true">
        
        <div className={`${ui.shellSkeleton} h-10 w-24 rounded-2xl`} />
        <div className={`${ui.shellSkeleton} h-10 w-24 rounded-2xl`} />
      </div>
    );
  }
  return (
    <div className="space-y-3" aria-hidden="true">
      
      <div className="flex items-center gap-3">
        
        <div className={`${ui.shellSkeleton} h-11 w-11 rounded-2xl`} />
        <div className="min-w-0 flex-1 space-y-2">
          
          <div className={`${ui.shellSkeleton} h-4 w-28 rounded`} />
          <div className={`${ui.shellSkeleton} h-3 w-36 rounded`} />
        </div>
      </div>
      <div className={`${ui.shellSkeleton} h-11 w-full rounded-2xl`} />
    </div>
  );
}
function GlobalNoticeBanner({ notice, href, onDismiss }) {
  if (!notice) return null;
  return (
    <div role="status" aria-live="polite" className={ui.shellNotice}>
      
      <div className="flex items-start justify-between gap-4">
        
        <div>
          
          <p className={ui.shellNoticeTitle}>{notice}</p>
          <p className={ui.shellNoticeBody}>
            إذا لم يظهر إشعار المتصفح، فعّل الإشعارات من الزر بالأعلى.
          </p>
          {href ? (
            <Link href={href} onClick={onDismiss} className={ui.shellNoticeBtn}>
              
              فتح الآن
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="إغلاق الإشعار"
          onClick={onDismiss}
          className={ui.shellNoticeClose}
        >
          
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className={ui.shellNoticeProgressTrack}>
        
        <div className={ui.shellNoticeProgressValue} />
      </div>
    </div>
  );
}
function AuthLoginLink({ className, onClick, compact = false }) {
  return (
    <Link href="/login" onClick={onClick} className={className}>
      
      {compact ? "الدخول للحساب" : "الدخول للحساب"}
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
  const hasActiveSubscription = hasActiveSubscriptionStatus(
    currentUser?.subscription_status,
  );
  const { hasSpot: hasSpotPlan, hasFutures: hasFuturesPlan } =
    getUserPlanAccess(currentUser);
  if (item.plan === "spot" && (!hasActiveSubscription || !hasSpotPlan)) {
    return "hidden";
  }
  if (item.plan === "futures" && (!hasActiveSubscription || !hasFuturesPlan)) {
    return "hidden";
  }
  return "visible";
}
const sidebarMenuItemClass = ui.shellMenuItem;
const sidebarMenuItemDesktopClass = ui.shellMenuItemDesktop;
function SidebarMenuItem({
  item,
  state,
  authResolved,
  currentUser,
  unreadAnalysisCount = 0,
  onNavigate,
  variant = "desktop",
}) {
  const itemClass =
    variant === "desktop" ? sidebarMenuItemDesktopClass : sidebarMenuItemClass;
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
        
        <span className={ui.shellMenuIcon}> {item.icon} </span>
        <span className={ui.shellMenuLabel}>{item.label}</span>
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
      
      <span className={ui.shellMenuIcon}> {item.icon} </span>
      <span className={ui.shellMenuLabel}>{item.label}</span>
      {item.href === "/my-analysis" && unreadAnalysisCount > 0 && (
        <span className={ui.shellBadgeCount}>
          
          {unreadAnalysisCount > 9 ? "9+" : unreadAnalysisCount}
        </span>
      )}
    </Link>
  );
}
function SidebarMenuGroup({
  group,
  isOpen,
  onToggle,
  children,
  variant = "desktop",
}) {
  const hasVisibleChildren = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);
  if (!hasVisibleChildren) {
    return null;
  }
  const summaryClass = ui.shellMenuGroup;
  return (
    <div className="space-y-2">
      
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className={`${summaryClass} w-full text-right`}
        aria-expanded={isOpen}
      >
        
        <span className={ui.shellMenuGroupIcon}> {group.icon} </span>
        <span className="font-black leading-none">{group.label}</span>
        <span
          className={
            isOpen ? ui.shellMenuGroupChevronOpen : ui.shellMenuGroupChevron
          }
        >
          ⌄
        </span>
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
function AdminMenuSection({
  authResolved,
  isAdmin,
  onNavigate,
  variant = "desktop",
}) {
  const sessionPending = !authResolved;
  if (!sessionPending && !isAdmin) {
    return null;
  }
  const adminLinkClass =
    variant === "desktop" ? ui.shellAdminLink : ui.shellAdminLinkMobile;
  return (
    <>
      
      <div className={ui.shellDivider} />
      {sessionPending ? (
        <div
          className={`${adminLinkClass} pointer-events-none cursor-wait opacity-60`}
          aria-hidden="true"
        >
          
          <span className={ui.shellMenuIcon + " animate-pulse"}> 🛠 </span>
          <span className={ui.shellSkeleton + " h-4 w-28 rounded"} />
        </div>
      ) : (
        <Link href="/admin" onClick={onNavigate} className={adminLinkClass}>
          
          <span className={ui.shellMenuIcon}> 🛠 </span>
          <span className={ui.shellMenuLabel}>لوحة الإدارة</span>
        </Link>
      )}
    </>
  );
}
function resolveThemeToggleLabel(
  theme,
  { compact = false, mobile = false } = {},
) {
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
  const {
    user: currentUser,
    status: authStatus,
    authResolved,
    isAdmin,
    logout,
    updateUser,
  } = useAuth();
  const [globalNotice, setGlobalNotice] = useState("");
  const [globalNoticeHref, setGlobalNoticeHref] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState("default");
  const [webPushEnabled, setWebPushEnabled] = useState(false);
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
  const shellNotificationPermission = mounted
    ? notificationPermission
    : "default";
  const shellWebPushEnabled = mounted ? webPushEnabled : false;
  const shellIsAdmin = mounted ? isAdmin : false;
  const shellUnreadAnalysisCount = mounted ? unreadAnalysisCount : 0;
  const shellThemeLabelSource = mounted ? theme : initialTheme;
  const mobileThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, {
    mobile: true,
  });
  const sidebarThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource);
  const headerThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, {
    compact: true,
  });
  const browserNotificationsActive =
    shellNotificationPermission === "granted" && shellWebPushEnabled;
  const browserNotificationLabel = browserNotificationsActive
    ? "🔔 إشعارات المتصفح مفعّلة ✅"
    : "🔔 تفعيل إشعارات المتصفح";
  const browserNotificationAriaLabel = browserNotificationsActive
    ? "إشعارات المتصفح مفعّلة"
    : "تفعيل إشعارات المتصفح";
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const toggleMenuGroup = useCallback((groupId) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
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
      void import("../../lib/push-client").then(
        ({ resolveBrowserPushState, setStoredPushEndpoint }) => {
          void (async () => {
            const browserState = await resolveBrowserPushState();
            if (!active) return;
            setNotificationPermission(browserState.permission);
            if (
              browserState.permission === "granted" &&
              browserState.hasSubscription
            ) {
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
                }),
              );
            }
          })();
        },
      );
    }, 2000);
    return () => {
      active = false;
      cancelDeferred();
    };
  }, []);
  useEffect(() => {
    const cancelDeferred = scheduleAfterPaint(() => {
      void import("../../lib/notification-sound-manager").then(
        ({ setupBrowserSoundUnlock }) => {
          setupBrowserSoundUnlock();
        },
      );
    }, 1800);
    return cancelDeferred;
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return undefined;
    const cancelDeferred = scheduleAfterPaint(() => {
      void import("../../lib/push-client").then(
        ({ ensureServiceWorkerRegistration }) => {
          ensureServiceWorkerRegistration().catch((err) => {
            console.warn(
              "Service worker registration skipped:",
              err?.message || err,
            );
          });
        },
      );
    }, 2500);
    return cancelDeferred;
  }, []);
  const savePushSubscription = async ({ existingSubscription = null } = {}) => {
    const pushClient = await import("../../lib/push-client");
    console.log(
      "push:client:start",
      JSON.stringify({ phase: "savePushSubscription" }),
    );
    const { user: authUser, error: authError } =
      await resolveSupabaseAuthUser();
    if (authError || !authUser?.id || !authUser?.email) {
      console.error(
        "push:api:error",
        JSON.stringify({
          phase: "client",
          reason: "MISSING_AUTH_USER",
          authError: authError?.message || null,
        }),
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
          }),
        );
        throw new Error(
          error?.message || "تعذر إنشاء اشتراك Web Push من المتصفح",
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
    return { apiCalled: true, subscription: result.subscription };
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
      JSON.stringify({ phase: "enableBrowserNotifications" }),
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
    try {
      const { resolveBrowserPushState, setStoredPushEndpoint } =
        await import("../../lib/push-client");
      const browserState = await resolveBrowserPushState();
      setNotificationPermission(browserState.permission);
      if (
        browserState.permission === "granted" &&
        browserState.hasSubscription
      ) {
        setWebPushEnabled(true);
        if (browserState.subscription?.endpoint) {
          setStoredPushEndpoint(browserState.subscription.endpoint);
        }
        console.log(
          "push:ui:enabled",
          JSON.stringify({ source: "button_existing_subscription" }),
        );
        if (authResolved && currentUser?.email && currentUser?.id) {
          try {
            await savePushSubscription({
              existingSubscription: browserState.subscription,
            });
          } catch (syncError) {
            console.warn(
              "Push subscription sync skipped:",
              syncError?.message || syncError,
            );
          }
        }
        showAppModal({
          type: "success",
          title: "إشعارات المتصفح",
          message: "الإشعارات مفعّلة مسبقًا.",
        });
        return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        showAppModal({
          type: "warning",
          title: "تم رفض الإشعارات",
          message:
            "تم رفض إشعارات المتصفح. يمكنك تفعيلها لاحقاً من إعدادات المتصفح.",
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
      console.log(
        "push:ui:enabled",
        JSON.stringify({ source: "button_new_subscription" }),
      );
    } catch (error) {
      setWebPushEnabled(false);
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
    if (!authResolved || !currentUser?.email || !currentUser?.id)
      return undefined;
    let active = true;
    const cancelDeferred = scheduleAfterPaint(() => {
      if (!active) return;
      void import("../../lib/push-client").then(
        ({ resolveBrowserPushState, setStoredPushEndpoint }) => {
          void (async () => {
            const browserState = await resolveBrowserPushState();
            if (!active) return;
            setNotificationPermission(browserState.permission);
            if (
              browserState.permission !== "granted" ||
              !browserState.hasSubscription
            ) {
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
              }),
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
              console.warn(
                "Push subscription sync skipped:",
                err?.message || err,
              );
            }
          })();
        },
      );
    }, 3000);
    return () => {
      active = false;
      cancelDeferred();
    };
  }, [authResolved, currentUser?.email, currentUser?.id]);
  const refreshCurrentUserSubscription = useCallback(async () => {
    if (
      !currentUser?.email ||
      (typeof document !== "undefined" && document.hidden)
    ) {
      return;
    }
    try {
      const response = await fetchWithTimeout(
        "/api/my-subscription-status",
        { method: "GET", cache: "no-store", credentials: "include" },
        5000,
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result?.active) {
        return;
      }
      const activePlanText = result.subscription_plan || "اشتراكك";
      const activationNoticeKey = `subscriptionActivationNotice-${currentUser.email}-${activePlanText}`;
      const alreadyNotified =
        localStorage.getItem(activationNoticeKey) === "yes";
      updateUser((prev) => {
        if (!prev) return prev;
        const wasInactive = !["نشط", "active", "مفعل"].includes(
          String(prev.subscription_status || "").toLowerCase(),
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
  }, [currentUser?.email, updateUser]); // Refresh subscription on login, tab focus, or realtime admin activation — no fast polling loop. useEffect(() => { if (!authResolved || !currentUser?.email) return undefined; let active = true; let channel = null; const runRefresh = () => { if (!active || document.hidden) return; void refreshCurrentUserSubscription(); }; const cancelDeferred = scheduleAfterPaint(() => { if (!active) return; runRefresh(); void import("../../lib/supabase").then(({ supabase }) => { if (!active) return; channel = supabase .channel(`global-subscription-refresh-${currentUser.email}`) .on( "postgres_changes", { event: "UPDATE", schema: "public", table: "subscription_requests", filter: `user_email=eq.${currentUser.email}`, }, (payload) => { if (payload?.new?.status === "مفعل") { runRefresh(); } } ) .subscribe(); }); }, 0); const handleVisibilityChange = () => { if (document.visibilityState === "visible") { runRefresh(); } }; document.addEventListener("visibilitychange", handleVisibilityChange); return () => { active = false; cancelDeferred(); document.removeEventListener("visibilitychange", handleVisibilityChange); const channelToRemove = channel; channel = null; if (channelToRemove) { void import("../../lib/supabase").then(({ supabase }) => { supabase.removeChannel(channelToRemove); }); } }; }, [authResolved, currentUser?.email, refreshCurrentUserSubscription]); const logoutAndRedirect = async () => { await logout(); window.location.href = "/login"; }; const dismissGlobalNotice = useCallback(() => { setGlobalNotice(""); setGlobalNoticeHref(""); }, []); if (isAuthPage) { return ( <> <GlobalNoticeBanner notice={globalNotice} href={globalNoticeHref} onDismiss={dismissGlobalNotice} /> {children} {bootstrapOverlay} {bootstrapStallBanner} </> ); } return ( <> <GlobalNoticeBanner notice={globalNotice} href={globalNoticeHref} onDismiss={dismissGlobalNotice} /> <div className="site-shell-root lg:flex lg:flex-row pt-0"> {mobileMenuOpen && ( <div className="fixed inset-0 z-[9998] lg:hidden"> <button aria-label="إغلاق القائمة" onClick={() => setMobileMenuOpen(false)} className="site-shell-drawer-scrim absolute inset-0" /> <aside role="dialog" aria-modal="true" aria-label="قائمة التنقل" className="site-mobile-drawer-panel absolute right-0 top-0 flex h-full w-[86%] max-w-[340px] flex-col overflow-hidden border-l p-4" > <div className="site-mobile-drawer-panel__overlay pointer-events-none absolute inset-0" /> <div className={ui.shellGridOverlay} /> <div className="site-sidebar-brand-card relative z-10 mb-4 flex items-center justify-between gap-3 p-3"> <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3"> <div className="site-sidebar-brand-badge grid h-11 w-11 place-items-center rounded-2xl"> <span className="site-sidebar-brand-badge__text font-black">HC</span> </div> <div> <h2 className="site-sidebar-brand-title font-black leading-5">HasaN CharT World</h2> <p className="site-sidebar-brand-subtitle text-xs">منصة التداول الذكية</p> </div> </Link> <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileMenuOpen(false)} className={ui.shellHeaderMenuBtn} > <span aria-hidden="true">✕</span> </button> </div> <nav className="relative z-10 flex-1 space-y-3 overflow-y-auto pr-1 pl-1 customScroll"> {renderSidebarGroups({ authResolved: shellAuthResolved, currentUser: shellUser, unreadAnalysisCount: shellUnreadAnalysisCount, isAdmin: shellIsAdmin, collapsedGroups, onToggleGroup: toggleMenuGroup, onNavigate: () => setMobileMenuOpen(false), variant: "mobile", })} </nav> <div className="site-shell-user-card relative z-10 mt-4 space-y-3 p-4"> <button onClick={toggleTheme} className="site-shell-theme-btn" > {mobileThemeLabel} </button> <button type="button" onClick={() => { void enableBrowserNotifications(); }} className={`browserPushBtn w-full rounded-2xl border px-4 py-3 text-sm font-black transition ${ browserNotificationsActive ? "browserPushBtn--active" : "" }`} > {browserNotificationLabel} </button> {authLoading ? ( <AuthAccountSkeleton /> ) : shellUser ? ( <> <Link href="/my-dashboard" onClick={() => setMobileMenuOpen(false)} className="mb-4 flex items-center gap-3"> <div className={ui.shellAvatar}> {(shellUser.username || shellUser.email || "U").slice(0, 2).toUpperCase()} </div> <div className="min-w-0"> <p className="truncate font-bold">{shellUser.username || "حسابي"}</p> <p className={`truncate text-xs ${ui.shellUserEmail}`}>{shellUser.email}</p> </div> </Link> <button onClick={logoutAndRedirect} className={ui.shellLogoutBtn}>تسجيل الخروج</button> </> ) : ( <AuthLoginLink onClick={() => setMobileMenuOpen(false)} className={ui.shellLoginBtn} /> )} </div> </aside> </div> )} <aside className="site-sidebar-panel relative z-[110] hidden lg:flex w-[292px] shrink-0 h-screen sticky top-0 overflow-hidden border-l backdrop-blur-2xl p-4 flex-col"> <div className="site-sidebar-panel__overlay pointer-events-none absolute inset-0" /> <div className={ui.shellGridOverlay} /> <Link href="/" className="site-sidebar-brand-card relative z-10 mb-6 flex items-center gap-3 p-3 group"> <div className="site-sidebar-brand-badge h-12 w-12 relative grid place-items-center overflow-hidden rounded-2xl"> <span className="site-sidebar-brand-badge__text font-black text-lg">HC</span> </div> <div> <h2 className="site-sidebar-brand-title font-black text-base leading-5 tracking-tight">HasaN CharT World</h2> <p className="site-sidebar-brand-subtitle text-xs">Trading Intelligence</p> </div> </Link> <nav className="relative z-10 flex-1 space-y-3 overflow-y-auto pr-1 pl-1 customScroll"> {renderSidebarGroups({ authResolved: shellAuthResolved, currentUser: shellUser, unreadAnalysisCount: shellUnreadAnalysisCount, isAdmin: shellIsAdmin, collapsedGroups, onToggleGroup: toggleMenuGroup, onNavigate: undefined, variant: "desktop", })} <details className={`group/contact ${ui.shellContactPanel}`}> <summary> <span className={ui.shellMenuIcon}>☎️</span> <span className={ui.shellMenuLabel}>تواصل معنا</span> <span className={`mr-auto ${ui.shellMenuGroupChevron} group-open/contact:rotate-180`}>⌄</span> </summary> <div className="space-y-2 px-3 pb-3 pt-1"> <Link href="/about" className={ui.shellContactLink} > <div className="flex items-center gap-2"> <span className={ui.shellMenuIcon}> ℹ️ </span> <div> <p className={`font-bold ${ui.shellMenuLabel}`}>من نحن</p> <p className={`text-[11px] ${ui.shellContactMuted}`}>تعرف على المنصة</p> </div> </div> <span className={ui.shellContactBadge}> فتح </span> </Link> {socialLinks.map((link) => ( <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={ui.shellContactLink}> <div className="flex items-center gap-2"> <span className={ui.shellMenuIcon}>{link.icon}</span> <div> <p className={`font-bold ${ui.shellMenuLabel}`}>{link.label}</p> <p className={`text-[11px] ${ui.shellContactMuted}`}>{link.badge}</p> </div> </div> <span className={ui.shellContactBadge}>فتح</span> </a> ))} </div> </details> </nav> <div className="site-shell-user-card relative z-10 mt-4 sidebarUserCard rounded-[24px] p-4"> <button onClick={toggleTheme} className="site-shell-theme-btn mb-3" > {sidebarThemeLabel} </button> {authLoading ? ( <AuthAccountSkeleton /> ) : shellUser ? ( <> <Link href="/my-dashboard" className="flex items-center gap-3 mb-4"> <div className={ui.shellAvatar}> {(shellUser.username || shellUser.email || "U").slice(0, 2).toUpperCase()} </div> <div className="min-w-0"> <p className="font-bold truncate">{shellUser.username || "حسابي"}</p> <p className={`text-xs truncate ${ui.shellUserEmail}`}>{shellUser.email}</p> </div> </Link> <button onClick={logoutAndRedirect} className={ui.shellLogoutBtn}>تسجيل الخروج</button> </> ) : ( <AuthLoginLink className={ui.shellLoginBtn} /> )} </div> </aside> <div className="site-main-shell"> <header className="site-top-header sticky top-0 z-40 overflow-visible px-4 md:px-6 py-4 backdrop-blur-2xl"> <div className="site-top-header__gradient pointer-events-none absolute inset-0" /> <div className="relative z-10 flex min-w-0 items-center justify-between gap-2 sm:gap-3"> <button type="button" onClick={() => setMobileMenuOpen(true)} className={`${ui.shellHeaderMenuBtn} lg:hidden`} aria-label="فتح القائمة" > <span aria-hidden="true">⋮</span> </button> <Link href="/" className="site-header-brand font-black text-lg flex items-center gap-2 min-w-0"> <span aria-hidden="true" className="site-header-logo-badge font-black"> HC </span> <span className="site-header-brand__text">HasaN CharT</span> </Link> <button type="button" aria-label={browserNotificationAriaLabel} onClick={() => { void enableBrowserNotifications(); }} className={`browserPushBtn inline-flex shrink-0 items-center justify-center rounded-2xl px-3 py-2 text-sm font-black transition sm:px-4 ${ browserNotificationsActive ? "browserPushBtn--active" : "" }`} > <span className="sm:hidden" aria-hidden="true"> 🔔 </span> <span className="hidden sm:inline">{browserNotificationLabel}</span> </button> {authLoading ? ( <div className={`${ui.shellSkeleton} hidden h-11 w-11 shrink-0 rounded-2xl sm:grid`} aria-hidden="true" /> ) : shellUser ? ( <NotificationBell className="relative shrink-0" /> ) : null} <button type="button" onClick={toggleTheme} aria-label={headerThemeLabel} className="site-header-theme-btn hidden md:inline-flex" > {headerThemeLabel} </button> {authLoading ? ( <AuthAccountSkeleton compact /> ) : shellUser ? ( <div className="hidden sm:flex items-center gap-3 min-w-0"> <Link href="/my-dashboard" className="topUserChip" title={shellUser.username || shellUser.email || "حسابي"} > {shellUser.username || shellUser.email || "حسابي"} </Link> <button type="button" onClick={logoutAndRedirect} className="topLogoutBtn" aria-label="تسجيل الخروج"> تسجيل الخروج </button> </div> ) : ( <AuthLoginLink className="topLoginBtn hidden sm:inline-flex" compact /> )} </div> </header> <MemoizedLayoutPageSlot>{children}</MemoizedLayoutPageSlot> </div> </div> {bootstrapOverlay} {bootstrapStallBanner} </> );
}
export default RootLayoutShell;
