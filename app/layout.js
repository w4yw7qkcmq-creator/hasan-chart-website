"use client";

import "./globals.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

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

export default function RootLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState(null);
  const [globalNotice, setGlobalNotice] = useState("");
  const [globalNoticeHref, setGlobalNoticeHref] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadAnalysisReplies, setUnreadAnalysisReplies] = useState(0);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const fallbackAdminEmails = [
    "alerts@hasanchartworld.com",
    "admin@hasanchartworld.com",
    "hasanchartworld@gmail.com",
    "ahmaagahmaadd@gmail.com",
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!globalNotice) return;

    const timer = setTimeout(() => {
      setGlobalNotice("");
      setGlobalNoticeHref("");
    }, 9000);

    return () => clearTimeout(timer);
  }, [globalNotice]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = localStorage.getItem("hasan-chart-theme") || "dark";
    const safeTheme = savedTheme === "light" ? "light" : "dark";

    setTheme(safeTheme);
    document.documentElement.setAttribute("data-theme", safeTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";

    setTheme(nextTheme);
    localStorage.setItem("hasan-chart-theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const enableBrowserNotifications = async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      alert("المتصفح لا يدعم الإشعارات");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      new Notification("HasaN CharT", {
        body: "تم تفعيل إشعارات الموقع بنجاح 🔔",
        icon: "/logo.png",
      });

      setGlobalNotice("🔔 تم تفعيل إشعارات الموقع بنجاح");
      setGlobalNoticeHref("");
    } else {
      alert("تم رفض الإشعارات من المتصفح");
    }
  };

  useEffect(() => {
    if (!currentUser?.email) return;

    const notifyIfNewReply = (row) => {
      if (!row?.id || !row?.reply || row.status !== "مكتمل") return;
      if (row.user_email !== currentUser.email) return;

      const replyKey = String(row.id);
      const seenReplies = JSON.parse(localStorage.getItem("seenAnalysisReplies") || "[]");
      const notifiedReplies = JSON.parse(localStorage.getItem("notifiedAnalysisReplies") || "[]");

      if (!seenReplies.includes(replyKey) && pathname !== "/my-analysis") {
        setUnreadAnalysisReplies((count) => Math.max(1, count + 1));
      }

      if (notifiedReplies.includes(replyKey)) return;

      localStorage.setItem(
        "notifiedAnalysisReplies",
        JSON.stringify([replyKey, ...notifiedReplies].slice(0, 100))
      );

      triggerReplyNotification(row.coin);
    };

    const checkLatestAnalysisReplies = async () => {
      try {
        const { data, error } = await supabase
          .from("analysis_requests")
          .select("id, coin, reply, status, user_email")
          .eq("user_email", currentUser.email)
          .eq("status", "مكتمل")
          .not("reply", "is", null)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error || !data?.length) return;

        const seenReplies = JSON.parse(localStorage.getItem("seenAnalysisReplies") || "[]");
        const notifiedReplies = JSON.parse(localStorage.getItem("notifiedAnalysisReplies") || "[]");

        const newReply = data.find((row) => {
          const key = String(row.id);
          return row?.reply && !seenReplies.includes(key) && !notifiedReplies.includes(key);
        });

        if (!newReply) return;

        const replyKey = String(newReply.id);
        localStorage.setItem(
          "notifiedAnalysisReplies",
          JSON.stringify([replyKey, ...notifiedReplies].slice(0, 100))
        );

        if (pathname !== "/my-analysis") {
          setUnreadAnalysisReplies((count) => Math.max(1, count + 1));
          triggerReplyNotification(newReply.coin);
        }
      } catch (err) {
        console.warn("Analysis reply notification check skipped:", err?.message || err);
      }
    };

    checkLatestAnalysisReplies();
    const analysisReplyTimer = setInterval(checkLatestAnalysisReplies, 10000);

    const channel = supabase
      .channel(`global-analysis-replies-${currentUser.email}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "analysis_requests",
          filter: `user_email=eq.${currentUser.email}`,
        },
        (payload) => notifyIfNewReply(payload.new)
      )
      .subscribe();

    return () => {
      clearInterval(analysisReplyTimer);
      supabase.removeChannel(channel);
    };
  }, [currentUser, pathname]);

  useEffect(() => {
    if (!currentUser?.email) {
      setUnreadAnalysisReplies(0);
      return;
    }

    const refreshUnreadReplies = async () => {
      try {
        const { data, error } = await supabase
          .from("analysis_requests")
          .select("id, reply, status")
          .eq("user_email", currentUser.email)
          .eq("status", "مكتمل")
          .not("reply", "is", null)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) return;

        const replyIds = (data || [])
          .filter((item) => item?.reply)
          .map((item) => String(item.id));

        if (pathname === "/my-analysis") {
          localStorage.setItem("seenAnalysisReplies", JSON.stringify(replyIds.slice(0, 100)));
          setUnreadAnalysisReplies(0);
          return;
        }

        const seenReplies = JSON.parse(localStorage.getItem("seenAnalysisReplies") || "[]");
        const unseenCount = replyIds.filter((id) => !seenReplies.includes(id)).length;
        setUnreadAnalysisReplies(unseenCount);
      } catch (err) {
        console.warn("Unread analysis replies skipped:", err?.message || err);
      }
    };

    refreshUnreadReplies();
  }, [currentUser, pathname]);

  const logout = async () => {
    localStorage.removeItem("currentUser");
    sessionStorage.removeItem("currentUser");
    localStorage.removeItem("hasan-chart-auth-session");
    localStorage.removeItem("sb-lzgsxdsumnteuwtjfqlm-auth-token");
    localStorage.removeItem("supabase.auth.token");
    sessionStorage.removeItem("hasan-chart-auth-session");
    sessionStorage.removeItem("sb-lzgsxdsumnteuwtjfqlm-auth-token");
    sessionStorage.removeItem("supabase.auth.token");
    setCurrentUser(null);
    window.dispatchEvent(new Event("storage"));

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Logout skipped:", err?.message || err);
    } finally {
      window.location.href = "/login";
    }
  };

  const triggerReplyNotification = (coin) => {
    const message = `📩 وصل رد الإدارة على طلب تحليل ${coin || "العملة"}`;
    setGlobalNotice(message);
    setGlobalNoticeHref("/my-analysis");
    setNotificationMenuOpen(true);

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("HasaN CharT", {
          body: message,
          icon: "/logo.png",
        });
      }
    }
  };

  const triggerVipSignalNotification = (signal) => {
    const typeLabel = signal?.signal_type === "futures" ? "Futures" : "Spot";
    const message = `🚨 تم نشر توصية VIP ${typeLabel} جديدة على ${signal?.coin || "عملة جديدة"}`;
    setGlobalNotice(message);
    setGlobalNoticeHref(signal?.signal_type === "futures" ? "/vip-futures" : "/vip-spot");
    setNotificationMenuOpen(true);

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("HasaN CharT World", {
          body: message,
          icon: "/logo.png",
        });
      }
    }
  };

  useEffect(() => {
    const buildUserFromSupabase = async (authUser, localUser = null) => {
      if (!authUser?.email) return null;

      let profile = null;

      try {
        const { data: profileById } = await supabase
          .from("profiles")
          .select("username, telegram, role, subscription_plan, subscription_status")
          .eq("id", authUser.id)
          .maybeSingle();

        if (profileById) {
          profile = profileById;
        } else {
          const { data: profileByEmail } = await supabase
            .from("profiles")
            .select("username, telegram, role, subscription_plan, subscription_status")
            .eq("email", authUser.email)
            .maybeSingle();

          profile = profileByEmail || null;
        }
      } catch (err) {
        console.warn("Profile load skipped:", err?.message || err);
      }

      let activeSubscriptions = [];

      try {
        const { data } = await supabase
          .from("subscription_requests")
          .select("plan_name, status")
          .eq("user_email", authUser.email)
          .eq("status", "مفعل")
          .order("created_at", { ascending: false });

        activeSubscriptions = data || [];
      } catch (err) {
        console.warn("Subscription load skipped:", err?.message || err);
      }

      const activePlanNames = activeSubscriptions
        .map((item) => item.plan_name)
        .filter(Boolean)
        .join(" | ");

      const cleanEmail = String(authUser.email || "").toLowerCase();
      const isFallbackAdmin = fallbackAdminEmails.includes(cleanEmail);

      const role = String(
        isFallbackAdmin
          ? "admin"
          : profile?.role || authUser.user_metadata?.role || localUser?.role || "user"
      ).trim();

      return {
        id: authUser.id,
        email: authUser.email,
        username:
          profile?.username ||
          authUser.user_metadata?.username ||
          localUser?.username ||
          authUser.email?.split("@")[0] ||
          "مستخدم",
        telegram: profile?.telegram || authUser.user_metadata?.telegram || localUser?.telegram || "",
        role,
        subscription_plan:
          activePlanNames ||
          profile?.subscription_plan ||
          localUser?.subscription_plan ||
          "بدون اشتراك",
        subscription_status:
          activeSubscriptions.length > 0
            ? "مفعل"
            : profile?.subscription_status || localUser?.subscription_status || "غير نشط",
        loggedAt: localUser?.loggedAt || new Date().toLocaleString("ar"),
      };
    };

    const loadUser = async () => {
      const localUser = JSON.parse(localStorage.getItem("currentUser") || "null");

      if (localUser) {
        setCurrentUser(localUser);
      }

      const { data } = await supabase.auth.getUser();

      if (!data?.user) {
        if (!localUser) {
          setCurrentUser(null);
        }
        return;
      }

      const syncedUser = await buildUserFromSupabase(data.user, localUser);

      if (!syncedUser) return;

      localStorage.setItem("currentUser", JSON.stringify(syncedUser));
      sessionStorage.setItem("currentUser", JSON.stringify(syncedUser));
      setCurrentUser(syncedUser);
    };

    loadUser();

    const syncUser = () => {
      const localUser = JSON.parse(localStorage.getItem("currentUser") || "null");
      setCurrentUser(localUser);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const localUser = JSON.parse(localStorage.getItem("currentUser") || "null");

      if (!session?.user) {
        if (!localUser) {
          setCurrentUser(null);
        }
        return;
      }

      const syncedUser = await buildUserFromSupabase(session.user, localUser);

      if (!syncedUser) return;

      localStorage.setItem("currentUser", JSON.stringify(syncedUser));
      sessionStorage.setItem("currentUser", JSON.stringify(syncedUser));
      setCurrentUser(syncedUser);
    });

    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.email) return;

    const activePlan = String(currentUser?.subscription_plan || "").toLowerCase();
    const activeStatus = String(currentUser?.subscription_status || "").toLowerCase();
    const hasActiveSubscription =
      activeStatus === "نشط" || activeStatus === "active" || activeStatus === "مفعل";

    if (!hasActiveSubscription) return;

    const hasSpotPlan = activePlan.includes("spot") || activePlan.includes("سبوت");
    const hasFuturesPlan = activePlan.includes("futures") || activePlan.includes("فيوتشر");

    const isAllowedVipSignal = (signal) => {
      if (!signal?.id || !signal?.signal_type) return false;
      if (signal.signal_type === "spot" && !hasSpotPlan) return false;
      if (signal.signal_type === "futures" && !hasFuturesPlan) return false;
      return true;
    };

    const notifyIfAllowedVipSignal = (signal) => {
      if (!isAllowedVipSignal(signal)) return;

      const seenSignals = JSON.parse(localStorage.getItem("seenVipSignals") || "[]");
      const signalKey = String(signal.id);

      if (seenSignals.includes(signalKey)) return;

      localStorage.setItem(
        "seenVipSignals",
        JSON.stringify([signalKey, ...seenSignals].slice(0, 100))
      );

      triggerVipSignalNotification(signal);
    };

    const checkLatestVipSignals = async () => {
      const lastCheckKey = `vipSignalsLastCheck-${currentUser.email}`;
      const lastCheck = localStorage.getItem(lastCheckKey);

      if (!lastCheck) {
        localStorage.setItem(lastCheckKey, new Date().toISOString());
        return;
      }

      const { data, error } = await supabase
        .from("vip_signals")
        .select("*")
        .gt("created_at", lastCheck)
        .order("created_at", { ascending: false })
        .limit(10);

      localStorage.setItem(lastCheckKey, new Date().toISOString());

      if (error || !data?.length) return;

      const allowedSignal = data.find((signal) => isAllowedVipSignal(signal));
      if (allowedSignal) {
        notifyIfAllowedVipSignal(allowedSignal);
      }
    };

    const pollingTimer = setInterval(checkLatestVipSignals, 5000);

    const channel = supabase
      .channel(`global-vip-signals-${currentUser.email}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vip_signals",
        },
        (payload) => notifyIfAllowedVipSignal(payload.new)
      )
      .subscribe();

    return () => {
      clearInterval(pollingTimer);
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  return (
    <html lang="ar" dir="rtl" data-theme={theme}>
      <head>
        <title>HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول</title>
        <meta
          name="description"
          content="HasaN CharT World منصة احترافية لمتابعة أسواق المال، تشمل تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، تنبيهات سعرية، أخبار اقتصادية، وطلبات تحليل العملات."
        />
        <meta
          name="keywords"
          content="HasaN CharT World, حسن شارت, تحليل بيتكوين, تحليل العملات الرقمية, توصيات كريبتو, توصيات فوركس, توصيات Spot, توصيات Futures, أخبار اقتصادية, تنبيهات سعرية, إدارة حسابات التداول"
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://www.hasanchartworld.com" />
        <meta name="application-name" content="HasaN CharT World" />
        <meta name="apple-mobile-web-app-title" content="HasaN CharT World" />
        <meta name="name" content="HasaN CharT World" />
        <meta itemProp="name" content="HasaN CharT World" />
        <meta name="theme-color" content="#020617" />
        <link rel="icon" type="image/png" sizes="1024x1024" href="/favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="1024x1024" href="/favicon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ar_AR" />
        <meta property="og:url" content="https://www.hasanchartworld.com" />
        <meta property="og:site_name" content="HasaN CharT World" />
        <meta property="og:title" content="HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول" />
        <meta property="og:determiner" content="" />
        <meta
          property="og:description"
          content="منصة HasaN CharT World تقدم تحليلات للأسواق المالية، توصيات Spot و Futures، أخبار اقتصادية، تنبيهات سعرية، وخدمات احترافية للمتداولين."
        />
        <meta property="og:image" content="https://www.hasanchartworld.com/favicon.png" />
        <meta property="og:image:secure_url" content="https://www.hasanchartworld.com/favicon.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="HasaN CharT World Logo" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="HasaN CharT World | تحليلات الأسواق المالية وتوصيات التداول" />
        <meta
          name="twitter:description"
          content="تابع تحليلات العملات الرقمية والفوركس، توصيات Spot و Futures، الأخبار الاقتصادية، والتنبيهات السعرية عبر منصة HasaN CharT World."
        />
        <meta name="twitter:image" content="https://www.hasanchartworld.com/favicon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "HasaN CharT World",
              alternateName: ["HasaN CharT", "Hasan Chart World", "حسن شارت"],
              url: "https://www.hasanchartworld.com",
              description:
                "منصة احترافية لمتابعة أسواق المال، تحليلات العملات الرقمية والفوركس، توصيات التداول، الأخبار الاقتصادية والتنبيهات السعرية.",
              publisher: {
                "@type": "Organization",
                name: "HasaN CharT World",
                logo: {
                  "@type": "ImageObject",
                  url: "https://www.hasanchartworld.com/favicon.png",
                },
              },
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-[#020617] text-white antialiased overflow-x-hidden">
        {globalNotice && (
          <div className="fixed left-5 top-5 z-[9999] max-w-md rounded-[26px] border border-emerald-300/25 bg-emerald-400/95 p-5 text-black shadow-[0_22px_70px_rgba(16,185,129,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black">{globalNotice}</p>
                <p className="mt-1 text-sm font-bold text-black/70">
                  إذا لم يظهر إشعار المتصفح، فعّل الإشعارات من الزر بالأعلى.
                </p>

                {globalNoticeHref && (
                  <Link
                    href={globalNoticeHref}
                    onClick={() => {
                      setGlobalNotice("");
                      setGlobalNoticeHref("");
                    }}
                    className="mt-3 inline-flex rounded-2xl bg-black/15 px-4 py-2 text-sm font-black text-black transition hover:bg-black/25"
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
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/10 font-black"
              >
                ✕
              </button>
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
                  {menuItems.map((item) => {
                    if (item.auth && !currentUser) return null;

                    const activePlan = String(currentUser?.subscription_plan || "").toLowerCase();
                    const activeStatus = String(currentUser?.subscription_status || "").toLowerCase();
                    const hasActiveSubscription =
                      activeStatus === "نشط" || activeStatus === "active" || activeStatus === "مفعل";

                    const hasSpotPlan = activePlan.includes("spot") || activePlan.includes("سبوت");
                    const hasFuturesPlan = activePlan.includes("futures") || activePlan.includes("فيوتشر");

                    if (item.plan === "spot" && (!hasActiveSubscription || !hasSpotPlan)) return null;
                    if (item.plan === "futures" && (!hasActiveSubscription || !hasFuturesPlan)) return null;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-cyan-300/15 bg-white/[0.045] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-cyan-300/45 hover:bg-gradient-to-l hover:from-blue-600/85 hover:via-cyan-500/45 hover:to-white/10"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">{item.icon}</span>
                        <span className="font-bold leading-none">{item.label}</span>
                        {item.href === "/my-analysis" && unreadAnalysisReplies > 0 && (
                          <span className="mr-auto grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
                            {unreadAnalysisReplies > 9 ? "9+" : unreadAnalysisReplies}
                          </span>
                        )}
                      </Link>
                    );
                  })}

                  {currentUser?.role === "admin" && (
                    <>
                      <div className="my-3 border-t border-cyan-300/15" />
                      <Link
                        href="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-emerald-300/45 hover:bg-gradient-to-l hover:from-emerald-500/65 hover:to-cyan-400/20"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10">🛠</span>
                        <span className="font-bold leading-none">لوحة الإدارة</span>
                      </Link>
                    </>
                  )}
                </nav>

                <div className="relative z-10 mt-4 space-y-3 rounded-[24px] border border-cyan-300/10 bg-white/[0.035] p-4 backdrop-blur-xl">
                  <button
                    onClick={toggleTheme}
                    className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    {theme === "light" ? "🌙 تفعيل الوضع الليلي" : "☀️ تفعيل الوضع النهاري"}
                  </button>

                  {currentUser ? (
                    <>
                      <Link href="/my-dashboard" onClick={() => setMobileMenuOpen(false)} className="mb-4 flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-300 font-black shadow-[0_0_25px_rgba(0,163,255,0.35)]">
                          {(currentUser.username || currentUser.email || "U").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold">{currentUser.username || "حسابي"}</p>
                          <p className="truncate text-xs text-cyan-100/50">{currentUser.email}</p>
                        </div>
                      </Link>
                      <button onClick={logout} className="w-full rounded-2xl border border-red-400/20 bg-red-500/15 px-4 py-3 font-black text-red-100 transition hover:bg-red-500/25">تسجيل الخروج</button>
                    </>
                  ) : (
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-3 text-center font-black shadow-[0_16px_40px_rgba(37,99,235,0.30)]">الدخول للحساب</Link>
                  )}
                </div>
              </aside>
            </div>
          )}
          <aside className="hidden lg:flex w-[292px] shrink-0 h-screen sticky top-0 overflow-hidden bg-[#020817] border-l border-cyan-300/20 shadow-[0_0_80px_rgba(0,102,255,0.24)] backdrop-blur-2xl p-4 z-50 flex-col relative">
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
              {menuItems.map((item) => {
                if (item.auth && !currentUser) return null;

                const activePlan = String(currentUser?.subscription_plan || "").toLowerCase();
                const activeStatus = String(currentUser?.subscription_status || "").toLowerCase();
                const hasActiveSubscription =
  activeStatus === "نشط" || activeStatus === "active" || activeStatus === "مفعل";

                const hasSpotPlan = activePlan.includes("spot") || activePlan.includes("سبوت");
                const hasFuturesPlan = activePlan.includes("futures") || activePlan.includes("فيوتشر");

                if (item.plan === "spot" && (!hasActiveSubscription || !hasSpotPlan)) return null;
                if (item.plan === "futures" && (!hasActiveSubscription || !hasFuturesPlan)) return null;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-cyan-300/15 bg-white/[0.045] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-x-1 hover:border-cyan-300/45 hover:bg-gradient-to-l hover:from-blue-600/85 hover:via-cyan-500/45 hover:to-white/10 hover:shadow-[0_16px_38px_rgba(0,102,255,0.28)]"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_18px_rgba(0,163,255,0.12)]">{item.icon}</span>
                    <span className="font-bold leading-none">{item.label}</span>
                    {item.href === "/my-analysis" && unreadAnalysisReplies > 0 && (
                      <span className="mr-auto grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
                        {unreadAnalysisReplies > 9 ? "9+" : unreadAnalysisReplies}
                      </span>
                    )}
                  </Link>
                );
              })}

              {currentUser?.role === "admin" && (
                <>
                  <div className="border-t border-cyan-300/15 my-3" />
                  <Link href="/admin" className="group relative flex min-h-[54px] items-center gap-3 overflow-hidden rounded-[18px] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-x-1 hover:border-emerald-300/45 hover:bg-gradient-to-l hover:from-emerald-500/65 hover:to-cyan-400/20">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10">🛠</span>
                    <span className="font-bold leading-none">لوحة الإدارة</span>
                  </Link>
                </>
              )}

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
                {theme === "light" ? "🌙 الوضع الليلي" : "☀️ الوضع النهاري"}
              </button>

              {currentUser ? (
                <>
                  <Link href="/my-dashboard" className="flex items-center gap-3 mb-4">
                    <div className="h-11 w-11 rounded-2xl grid place-items-center bg-gradient-to-br from-blue-600 to-cyan-300 font-black shadow-[0_0_25px_rgba(0,163,255,0.35)]">
                      {(currentUser.username || currentUser.email || "U").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold truncate">{currentUser.username || "حسابي"}</p>
                      <p className="text-xs text-cyan-100/50 truncate">{currentUser.email}</p>
                    </div>
                  </Link>
                  <button onClick={logout} className="w-full rounded-2xl bg-red-500/15 border border-red-400/20 px-4 py-3 text-red-100 font-black hover:bg-red-500/25 transition">تسجيل الخروج</button>
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
                  onClick={enableBrowserNotifications}
                  className={`hidden rounded-2xl px-4 py-2 text-sm font-black transition sm:inline-flex ${
                    notificationPermission === "granted"
                      ? "border border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                      : "border border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
                  }`}
                >
                  {notificationPermission === "granted"
                    ? "🔔 الإشعارات مفعلة"
                    : "🔔 تفعيل إشعارات الموقع"}
                </button>

                {currentUser && (
                  <div className="relative hidden sm:block">
                    <button
                      type="button"
                      onClick={() => setNotificationMenuOpen((open) => !open)}
                      className="relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-xl text-cyan-100 shadow-[0_0_24px_rgba(0,163,255,0.18)] transition hover:bg-cyan-400/20"
                      aria-label="الإشعارات"
                    >
                      🔔
                      {unreadAnalysisReplies > 0 && (
                        <span className="absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
                          {unreadAnalysisReplies > 9 ? "9+" : unreadAnalysisReplies}
                        </span>
                      )}
                    </button>

                    {notificationMenuOpen && (
                      <div className="fixed left-5 top-20 z-[99999] min-h-[130px] w-[340px] max-w-[calc(100vw-40px)] rounded-[26px] border border-cyan-300/40 bg-gradient-to-br from-sky-400 to-blue-500 p-4 text-white shadow-[0_24px_80px_rgba(0,102,255,0.35)] backdrop-blur-2xl">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3
                            className="font-black text-xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
                            style={{ color: "#ffffff" }}
                          >
                            الإشعارات
                          </h3>
                          <button
                            type="button"
                            onClick={() => setNotificationMenuOpen(false)}
                            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-black !text-white"
                          >
                            ✕
                          </button>
                        </div>

                        {unreadAnalysisReplies > 0 ? (
                          <Link
                            href="/my-analysis"
                            onClick={() => {
                              setNotificationMenuOpen(false);
                              setUnreadAnalysisReplies(0);
                            }}
                            className="block rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 transition hover:bg-emerald-400/20"
                          >
                            <p className="font-black text-emerald-100">📩 لديك ردود إدارة جديدة</p>
                            <p className="mt-1 text-sm text-slate-400">
                              عدد الردود غير المقروءة: {unreadAnalysisReplies}
                            </p>
                          </Link>
                        ) : (
                          <div className="rounded-2xl border border-white/30 bg-white/20 p-4 text-sm text-white font-bold">
                            لا توجد إشعارات جديدة حالياً.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={toggleTheme}
                  className="hidden rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 md:inline-flex"
                >
                  {theme === "light" ? "🌙 ليلي" : "☀️ نهاري"}
                </button>

                {currentUser ? (
                  <div className="hidden sm:flex items-center gap-3">
                    <Link href="/my-dashboard" className="topUserChip">{currentUser.username || currentUser.email || "حسابي"}</Link>
                    <button onClick={logout} className="topLogoutBtn">تسجيل الخروج</button>
                  </div>
                ) : (
                  <Link href="/login" className="topLoginBtn hidden sm:inline-flex">الدخول للحساب</Link>
                )}
              </div>
            </header>

            <main className="w-full p-3 pt-3 md:p-4 md:pt-4">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}