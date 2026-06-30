"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { scheduleAfterPaint } from "../../lib/schedule-after-paint";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import { resolveSupabaseAuthUser } from "../../lib/auth-session-client";
import { supabase } from "../../lib/supabase";
import {
  ensureServiceWorkerRegistration,
  getAnonymousPushId,
  getExistingPushSubscription,
  resolveBrowserPushState,
  savePushSubscriptionViaApi,
  serializePushSubscription,
  setStoredPushEndpoint,
  subscribeToWebPush,
} from "../../lib/push-client";
import { useAppModal } from "./AppModalProvider";
import { useAuth } from "./AuthProvider";
import { useBootstrapLoadingOverlay } from "../hooks/useBootstrapLoadingOverlay";
import { useClientMounted } from "../hooks/useClientMounted";
import { NotificationBell } from "./notifications/NotificationBell";
import { useNotifications } from "./notifications/NotificationProvider";
import { useTheme } from "./ThemeProvider";

const menuItems = [
  { href: "/", icon: "🏠", label: "الرئيسية" },
  { href: "/#market-windows", icon: "▣", label: "نوافذ السوق" },
  { href: "/#prices", icon: "📊", label: "الأسعار المباشرة" },
  { href: "/#chart", icon: "📈", label: "الشارت الحي" },
  { href: "/#analysis", icon: "🧠", label: "طلب تحليل عملة" },
  { href: "/my-dashboard#instant-analysis", icon: "📈", label: "أطلب تحليل لحظي الآن", auth: true },
  { href: "/#alerts", icon: "🔔", label: "تنبيه سعر" },
  { href: "/#services", icon: "💼", label: "الخدمات" },
  { href: "/my-dashboard", icon: "👤", label: "لوحة المستخدم", auth: true },
  { href: "/my-analysis", icon: "📩", label: "طلباتي وردود الإدارة", auth: true },
  { href: "/subscriptions", icon: "💎", label: "الاشتراكات" },
  { href: "/vip-spot", icon: "⭐", label: "توصيات VIP Spot", auth: true, plan: "spot" },
  { href: "/vip-futures", icon: "🔥", label: "توصيات VIP Futures", auth: true, plan: "futures" },
  { href: "/account-management", icon: "📂", label: "إدارة الحسابات" },
  { href: "/daily-analysis", icon: "📝", label: "التحليلات اليومية" },
  { href: "/news", icon: "📰", label: "الأخبار" },
  { href: "/affiliate", icon: "🤝", label: "التسويق بالعمولة" },
];


const socialLinks = [
  { label: "الدعم الفني", badge: "Telegram", icon: "🛟", href: "https://t.me/HasaNCharTSupport" },
  { label: "القناة الرسمية", badge: "Telegram", icon: "📢", href: "https://t.me/HsaNCharT" },
  { label: "د. حسن", badge: "Telegram", icon: "👨‍🏫", href: "https://t.me/CEOHasaNCharT" },
  { label: "منصة X", badge: "X", icon: "𝕏", href: "https://x.com/HasanChart" },
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
  unreadAnalysisCount = 0,
  onNavigate,
  variant = "desktop",
}) {
  const itemClass = variant === "desktop" ? sidebarMenuItemDesktopClass : sidebarMenuItemClass;

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
      href={item.href}
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

function RootLayoutShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { showAppModal } = useAppModal();
  const { user: currentUser, status: authStatus, authResolved, isAdmin, logout, updateUser } = useAuth();
  const [globalNotice, setGlobalNotice] = useState("");
  const [globalNoticeHref, setGlobalNoticeHref] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [webPushEnabled, setWebPushEnabled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { unreadAnalysisCount } = useNotifications();
  const { theme, initialTheme, toggleTheme } = useTheme();
  const mounted = useClientMounted();
  const shellUser = mounted ? currentUser : null;
  const shellAuthResolved = mounted ? authResolved : false;
  const shellNotificationPermission = mounted ? notificationPermission : "default";
  const shellWebPushEnabled = mounted ? webPushEnabled : false;
  const shellIsAdmin = mounted ? isAdmin : false;
  const shellUnreadAnalysisCount = mounted ? unreadAnalysisCount : 0;
  const shellThemeLabelSource = mounted ? theme : initialTheme;
  const mobileThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { mobile: true });
  const sidebarThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource);
  const headerThemeLabel = resolveThemeToggleLabel(shellThemeLabelSource, { compact: true });
  const browserNotificationsActive =
    shellNotificationPermission === "granted" && shellWebPushEnabled;
  const browserNotificationLabel = browserNotificationsActive
    ? "🔔 إشعارات المتصفح مفعّلة ✅"
    : "🔔 تفعيل إشعارات المتصفح";
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const { overlay: bootstrapOverlay, stallBanner: bootstrapStallBanner } =
    useBootstrapLoadingOverlay(authResolved, { enabled: !isAuthPage });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let active = true;

    void (async () => {
      const browserState = await resolveBrowserPushState();
      if (!active) return;

      setNotificationPermission(browserState.permission);

      if (browserState.permission === "granted" && browserState.hasSubscription) {
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
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    ensureServiceWorkerRegistration().catch((err) => {
      console.warn("Service worker registration skipped:", err?.message || err);
    });
  }, []);

  const savePushSubscription = async ({ existingSubscription = null } = {}) => {
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
      subscription = await getExistingPushSubscription();
    }

    if (!subscription) {
      try {
        subscription = await subscribeToWebPush();
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

    const payload = serializePushSubscription(subscription);

    if (!payload?.endpoint || !payload?.keys?.p256dh || !payload?.keys?.auth) {
      throw new Error("تعذر قراءة بيانات اشتراك Push من المتصفح");
    }

    const anonymousId = getAnonymousPushId();
    const result = await savePushSubscriptionViaApi({
      subscription: payload,
      anonymousId,
      userEmail: String(authUser.email).trim().toLowerCase(),
      userId: String(authUser.id).trim(),
    });

    setStoredPushEndpoint(payload.endpoint);
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
      const browserState = await resolveBrowserPushState();
      setNotificationPermission(browserState.permission);

      if (browserState.permission === "granted" && browserState.hasSubscription) {
        setWebPushEnabled(true);

        if (browserState.subscription?.endpoint) {
          setStoredPushEndpoint(browserState.subscription.endpoint);
        }

        console.log(
          "push:ui:enabled",
          JSON.stringify({
            source: "button_existing_subscription",
          })
        );

        if (authResolved && currentUser?.email && currentUser?.id) {
          try {
            await savePushSubscription({
              existingSubscription: browserState.subscription,
            });
          } catch (syncError) {
            console.warn(
              "Push subscription sync skipped:",
              syncError?.message || syncError
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

      console.log(
        "push:ui:enabled",
        JSON.stringify({
          source: "button_new_subscription",
        })
      );
    } catch (error) {
      setWebPushEnabled(false);
      setStoredPushEndpoint("");

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

      void (async () => {
        const browserState = await resolveBrowserPushState();
        if (!active) return;

        setNotificationPermission(browserState.permission);

        if (browserState.permission !== "granted" || !browserState.hasSubscription) {
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
      if (channel) {
        supabase.removeChannel(channel);
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
          <div className="fixed left-5 top-5 z-[9999] max-w-md overflow-hidden rounded-[28px] border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 p-5 text-white shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl">
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
                onClick={() => {
                  setGlobalNotice("");
                  setGlobalNoticeHref("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-black text-white transition hover:bg-white/30"
              >
                ✕
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
          <div className="fixed left-5 top-5 z-[9999] max-w-md overflow-hidden rounded-[28px] border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 p-5 text-white shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl">
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
                onClick={() => {
                  setGlobalNotice("");
                  setGlobalNoticeHref("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-black text-white transition hover:bg-white/30"
              >
                ✕
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

              <aside className="absolute right-0 top-0 flex h-full w-[86%] max-w-[340px] flex-col overflow-hidden border-l border-cyan-300/20 bg-[#020817] p-4 shadow-[0_0_80px_rgba(0,102,255,0.30)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
                <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

                <div className="relative z-10 mb-4 flex items-center justify-between gap-3 rounded-[24px] border border-cyan-300/15 bg-white/[0.05] p-3">
                  <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-blue-600/35 via-cyan-400/15 to-black/40 font-black text-white">HC</div>
                    <div>
                      <h2 className="font-black leading-5">HasaN CharT World</h2>
                      <p className="text-xs text-cyan-100/60">Trading Intelligence</p>
                    </div>
                  </Link>

                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xl font-black text-white"
                  >
                    ✕
                  </button>
                </div>

                <nav className="relative z-10 flex-1 space-y-2 overflow-y-auto pr-1 pl-1 customScroll">
                  {menuItems.map((item) => (
                    <SidebarMenuItem
                      key={item.href}
                      item={item}
                      state={resolveMenuItemState(item, shellAuthResolved, shellUser)}
                      unreadAnalysisCount={shellUnreadAnalysisCount}
                      onNavigate={() => setMobileMenuOpen(false)}
                      variant="mobile"
                    />
                  ))}

                  <AdminMenuSection
                    authResolved={shellAuthResolved}
                    isAdmin={shellIsAdmin}
                    onNavigate={() => setMobileMenuOpen(false)}
                    variant="mobile"
                  />
                </nav>

                <div className="relative z-10 mt-4 space-y-3 rounded-[24px] border border-cyan-300/10 bg-white/[0.035] p-4 backdrop-blur-xl">
                  <button
                    onClick={toggleTheme}
                    className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    {mobileThemeLabel}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void enableBrowserNotifications();
                    }}
                    className={`browserPushBtn w-full rounded-2xl border px-4 py-3 text-sm font-black transition ${
                      browserNotificationsActive ? "browserPushBtn--active" : ""
                    }`}
                  >
                    {browserNotificationLabel}
                  </button>

                  {shellUser ? (
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
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]">الدخول للحساب</Link>
                  )}
                </div>
              </aside>
            </div>
          )}
          <aside className="relative z-[110] hidden lg:flex w-[292px] shrink-0 h-screen sticky top-0 overflow-hidden bg-[#020817] border-l border-cyan-300/20 shadow-[0_0_80px_rgba(0,102,255,0.24)] backdrop-blur-2xl p-4 flex-col">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.38),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(180deg,rgba(7,20,47,0.96),rgba(2,6,23,0.98))]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />

            <Link href="/" className="relative z-10 mb-6 flex items-center gap-3 rounded-[26px] border border-cyan-300/15 bg-white/[0.05] p-3 shadow-[0_18px_45px_rgba(0,102,255,0.15)] group">
              <div className="h-12 w-12 relative grid place-items-center overflow-hidden rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-blue-600/35 via-cyan-400/15 to-black/40 shadow-[0_0_35px_rgba(0,163,255,0.30)]">
                <span className="font-black text-white text-lg">HC</span>
              </div>
              <div>
                <h2 className="font-black text-base leading-5 tracking-tight">HasaN CharT World</h2>
                <p className="text-xs text-cyan-100/60">Trading Intelligence</p>
              </div>
            </Link>

            <nav className="relative z-10 flex-1 space-y-2 overflow-y-auto pr-1 pl-1 customScroll">
              {menuItems.map((item) => (
                <SidebarMenuItem
                  key={item.href}
                  item={item}
                  state={resolveMenuItemState(item, shellAuthResolved, shellUser)}
                  unreadAnalysisCount={shellUnreadAnalysisCount}
                  variant="desktop"
                />
              ))}

              <AdminMenuSection authResolved={shellAuthResolved} isAdmin={shellIsAdmin} variant="desktop" />

              <details className="group/contact rounded-[18px] border border-cyan-300/15 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 rounded-[18px] px-4 py-3 text-white transition hover:-translate-x-1 hover:border-cyan-300/45 hover:bg-gradient-to-l hover:from-blue-600/85 hover:via-cyan-500/45 hover:to-white/10">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">☎️</span>
                  <span className="font-bold leading-none">تواصل معنا</span>
                  <span className="mr-auto text-cyan-100/60 transition group-open/contact:rotate-180">⌄</span>
                </summary>

                <div className="space-y-2 px-3 pb-3 pt-1">
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

              {shellUser ? (
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
                <Link href="/login" className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]">الدخول للحساب</Link>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-x-hidden">
            <header className="sticky top-0 z-40 overflow-visible bg-[#020817]/90 border-b border-cyan-300/15 backdrop-blur-2xl px-4 md:px-6 py-4 shadow-[0_14px_50px_rgba(0,102,255,0.16)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(11,99,255,0.20),transparent_28%),linear-gradient(90deg,rgba(2,6,23,0.92),rgba(7,20,47,0.88),rgba(2,6,23,0.92))]" />
              <div className="relative z-10 flex items-center justify-between gap-3">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-2xl font-black text-cyan-100 shadow-[0_0_24px_rgba(0,163,255,0.18)] lg:hidden"
                  aria-label="فتح القائمة"
                >
                  ⋮
                </button>
                <Link href="/" className="font-black text-lg whitespace-nowrap flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600/20 border border-cyan-300/25 shadow-[0_0_20px_rgba(0,163,255,0.18)]">HC</span>
                  HasaN CharT
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    void enableBrowserNotifications();
                  }}
                  className={`browserPushBtn inline-flex rounded-2xl px-4 py-2 text-sm font-black transition ${
                    browserNotificationsActive ? "browserPushBtn--active" : ""
                  }`}
                >
                  {browserNotificationLabel}
                </button>

                {shellUser ? <NotificationBell className="relative shrink-0" /> : null}

                <button
                  onClick={toggleTheme}
                  className="hidden rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 md:inline-flex"
                >
                  {headerThemeLabel}
                </button>

                {shellUser ? (
                  <div className="hidden sm:flex items-center gap-3">
                    <Link href="/my-dashboard" className="topUserChip">{shellUser.username || shellUser.email || "حسابي"}</Link>
                    <button onClick={logoutAndRedirect} className="topLogoutBtn">تسجيل الخروج</button>
                  </div>
                ) : (
                  <Link href="/login" className="topLoginBtn hidden sm:inline-flex">الدخول للحساب</Link>
                )}
              </div>
            </header>

            <main className="w-full p-3 pt-3 md:p-4 md:pt-4">{children}</main>
          </div>
        </div>
        {bootstrapOverlay}
        {bootstrapStallBanner}
    </>
  );
}

export default RootLayoutShell;
