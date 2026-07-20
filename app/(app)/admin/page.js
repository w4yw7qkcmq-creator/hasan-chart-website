"use client";

import "./admin-theme.css";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../lib/admin-fetch";
import {
  acknowledgeAdminDashboardNotifications,
  countUnacknowledgedAdminNotifications,
  isAdminDashboardNotificationAcknowledged,
} from "../../../lib/admin-dashboard-notifications";
import {
  isNotificationCenterRendered,
  markNotificationCenterRendered,
  notify,
} from "../../../lib/notification-center";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";
import {
  ADMIN_STATUS_FILTERS,
  ADMIN_TABS,
  SIMPLE_STATUS_OPTIONS,
  countAdminStatusFilter,
  formatAccountManagementRequest,
  formatAnalysisRequest,
  formatSubscriptionRequest,
  getAdminStatusKey,
  getAdminStatusLabel,
  getSimpleStatusSelectValue,
  isValidPreviewUrl,
  matchesAdminSearch,
  matchesAdminStatusFilter,
} from "./admin-dashboard-helpers";
import AdminOverviewNavLink from "./components/AdminOverviewNavLink";
import AdminStat from "./components/AdminStat";
import StatusBadge from "./components/StatusBadge";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";
import {
  ADMIN_SHELL_SECTIONS,
  createAdminSectionState,
  fetchAdminDashboardSection,
  getAdminTabRefreshSections,
  getCachedAdminSection,
  invalidateAdminSectionCache,
  isAdminSectionCacheFresh,
  logAdminSectionLoad,
  mapAdminTabToSections,
  setCachedAdminSection,
} from "../../../lib/admin-dashboard-client";

const AppModal = dynamic(() => import("../../components/AppModal"), { ssr: false });

function AdminQuickStatsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="admin-stat-chip animate-pulse">
          <div className="h-3 w-24 rounded bg-slate-200/70" />
          <div className="mt-3 h-8 w-12 rounded-lg bg-slate-300/70" />
        </div>
      ))}
    </>
  );
}

function AdminStatsGridSkeleton() {
  return (
    <section className="order-1 grid gap-5 md:grid-cols-2 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="relative animate-pulse overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="h-3 w-24 rounded bg-white/15" />
              <div className="h-9 w-16 rounded-lg bg-white/20" />
              <div className="h-3 w-32 rounded bg-white/10" />
            </div>
            <div className="h-14 w-14 rounded-2xl bg-white/10" />
          </div>
        </div>
      ))}
    </section>
  );
}

function AdminRecentItemsSkeleton() {
  return (
    <section className="order-3 admin-section animate-pulse p-5 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded bg-white/15" />
          <div className="h-3 w-64 rounded bg-white/10" />
        </div>
        <div className="h-8 w-20 rounded-full bg-white/10" />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-cyan-300/15 bg-white/[0.04] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 shrink-0 rounded-2xl bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-white/15" />
                <div className="h-3 w-full rounded bg-white/10" />
                <div className="h-2.5 w-20 rounded bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminRequestsPanelSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <section className="admin-section p-4 md:p-5">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-11 w-36 rounded-2xl bg-white/10" />
          ))}
        </div>
        <div className="mt-4 h-12 rounded-2xl bg-white/10" />
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="admin-section min-h-[18rem] rounded-[28px] border border-cyan-300/10 bg-white/[0.04] p-5"
          >
            <div className="space-y-4">
              <div className="h-7 w-2/5 rounded bg-white/15" />
              <div className="flex flex-wrap gap-2">
                <div className="h-8 w-24 rounded-full bg-white/10" />
                <div className="h-8 w-20 rounded-full bg-white/10" />
              </div>
              <div className="h-24 rounded-2xl bg-white/[0.06]" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-11 rounded-2xl bg-white/10" />
                <div className="h-11 rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AdminSectionRefreshingIndicator({ visible }) {
  if (!visible) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-100">
      ⟳ تحديث
    </span>
  );
}

function AdminSectionError({ message, onRetry }) {
  return (
    <div className="admin-section p-6 text-center">
      <p className="font-black text-red-200">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="admin-btn-surface mt-4 px-5 py-3">
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}

const DailyAnalysisPublishPanel = dynamic(
  () =>
    import("./DailyAnalysisPublishPanel").then((mod) => mod.DailyAnalysisPublishPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.04] p-8 text-center text-sm text-slate-300">
        جاري تحميل لوحة النشر...
      </div>
    ),
  }
);

const AdminUserManagementPanel = dynamic(
  () => import("./components/AdminUserManagementPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.04] p-8 text-center text-sm text-slate-300">
        جاري تحميل إدارة المستخدمين...
      </div>
    ),
  }
);

export default function AdminPage() {
  const router = useRouter();
  const { logout, authResolved, profileReady, user, isAdmin } = useAuth();
  const [analysisRequests, setAnalysisRequests] = useState([]);
  const [accountRequests, setAccountRequests] = useState([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [dataMode, setDataMode] = useState("supabase");
  const [replies, setReplies] = useState({});
  const [filter, setFilter] = useState("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [activeAdminTab, setActiveAdminTab] = useState("overview");
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [adminAcknowledgedVersion, setAdminAcknowledgedVersion] = useState(0);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const [adminFeedNotifications, setAdminFeedNotifications] = useState([]);
  const adminNotificationsRef = useRef(null);
  const adminNotificationsBellRef = useRef(null);
  const adminNotificationsPanelRef = useRef(null);
  const [adminNotificationsDropdownStyle, setAdminNotificationsDropdownStyle] = useState(null);
  const updateRequestStatus = async (table, requestId, newStatus) => {
    const confirmed = await confirmAdminAction(`هل تريد تغيير حالة الطلب إلى: ${getAdminStatusLabel(newStatus)}؟`);
    if (!confirmed) return;

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update-request-status",
          requestId,
          table,
          status: newStatus,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحديث حالة الطلب");
      }

      if (table === "analysis_requests") {
        setAnalysisRequests((prev) =>
          prev.map((item) => (item.id === requestId ? { ...item, status: newStatus } : item))
        );
      }

      if (table === "subscription_requests") {
        setSubscriptionRequests((prev) =>
          prev.map((item) => (item.id === requestId ? { ...item, status: newStatus } : item))
        );
      }

      if (table === "account_management_requests") {
        setAccountRequests((prev) =>
          prev.map((item) => (item.id === requestId ? { ...item, status: newStatus } : item))
        );
      }

      showAdminNotice("تم تحديث حالة الطلب بنجاح");
    } catch (error) {
      showAdminNotice(error?.message || "تعذر تحديث حالة الطلب", "error");
    }
  };
  const [expandedAnalysis, setExpandedAnalysis] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiStats, setApiStats] = useState(null);
  const [sectionStates, setSectionStates] = useState({
    stats: createAdminSectionState(),
    overview: createAdminSectionState(),
    analysis: createAdminSectionState(),
    accounts: createAdminSectionState(),
    subscriptions: createAdminSectionState(),
  });
  const sectionFetchRef = useRef(new Set());
  const abortControllersRef = useRef(new Map());
  const adminInitStartedRef = useRef(false);
  const [refreshWarning, setRefreshWarning] = useState("");
  const [replySending, setReplySending] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [vipSignalForm, setVipSignalForm] = useState({
    signal_type: "spot",
    coin: "",
    entry: "",
    targets: "",
    stop_loss: "",
    notes: "",
  });
  const [accountKeys, setAccountKeys] = useState({});
  const [accountKeysLoading, setAccountKeysLoading] = useState({});
  const [proofPreview, setProofPreview] = useState(null);

  // Admin Notice/Confirm modals
  const [adminNotice, setAdminNotice] = useState({
    open: false,
    type: "success",
    title: "تم بنجاح",
    message: "تم تنفيذ العملية بنجاح",
  });
  const [adminConfirm, setAdminConfirm] = useState({
    open: false,
    message: "",
    resolve: null,
  });

  const showAdminNotice = (message, type = "success", title) => {
    setAdminNotice({
      open: true,
      type,
      title: title || (type === "error" ? "تعذر تنفيذ العملية" : "تم بنجاح"),
      message,
    });
  };

  const confirmAdminAction = (message) =>
    new Promise((resolve) => {
      setAdminConfirm({
        open: true,
        message,
        resolve,
      });
    });

  const closeAdminConfirm = (value) => {
    setAdminConfirm((current) => {
      if (typeof current.resolve === "function") {
        current.resolve(value);
      }

      return {
        open: false,
        message: "",
        resolve: null,
      };
    });
  };

  useEffect(() => {
    if (!adminNotificationsOpen) return;

    const handlePointerDown = (event) => {
      if (event.target.closest("a[href]")) return;

      if (
        adminNotificationsRef.current?.contains(event.target) ||
        adminNotificationsPanelRef.current?.contains(event.target)
      ) {
        return;
      }

      setAdminNotificationsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [adminNotificationsOpen]);

  const updateAdminNotificationsDropdownPosition = useCallback(() => {
    const bell = adminNotificationsBellRef.current;
    if (!bell) return;

    const rect = bell.getBoundingClientRect();
    const panelWidth = Math.min(360, window.innerWidth - 16);

    setAdminNotificationsDropdownStyle({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - panelWidth),
      width: panelWidth,
    });
  }, []);

  useEffect(() => {
    if (!adminNotificationsOpen) return;

    updateAdminNotificationsDropdownPosition();

    const handleReposition = () => updateAdminNotificationsDropdownPosition();

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [adminNotificationsOpen, updateAdminNotificationsDropdownPosition]);

  useEffect(() => {
    return () => {
      setProofPreview(null);
      setAdminNotificationsOpen(false);
      setAdminNotice((current) => ({ ...current, open: false }));
      setAdminConfirm((current) => {
        if (typeof current.resolve === "function") {
          current.resolve(false);
        }

        return {
          open: false,
          message: "",
          resolve: null,
        };
      });
    };
  }, []);

  // Helper for admin API calls with auto session refresh (shared lib/admin-fetch.js)

  const loadAccountKeys = async (requestId) => {
    if (accountKeys[requestId]) {
      setAccountKeys((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      return;
    }

    if (accountKeysLoading[requestId]) return;

    setAccountKeysLoading((prev) => ({ ...prev, [requestId]: true }));

    try {
      const response = await adminFetch("/api/admin/account-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر عرض المفاتيح");
      }

      setAccountKeys((prev) => ({
        ...prev,
        [requestId]: result.keys || {},
      }));
    } catch (error) {
      showAdminNotice(error?.message || "تعذر عرض المفاتيح الحساسة", "error");
    } finally {
      setAccountKeysLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };


  const applySectionResult = useCallback((section, result) => {
    if (section === "stats" && result.stats) {
      setApiStats(result.stats);
    }

    if (section === "overview" || section === "notifications") {
      setAdminFeedNotifications(result.admin_notifications || []);
    }

    if (section === "analysis") {
      setAnalysisRequests((result.analysis_requests || []).map(formatAnalysisRequest));
    }

    if (section === "accounts") {
      setAccountRequests((result.account_management_requests || []).map(formatAccountManagementRequest));
    }

    if (section === "subscriptions") {
      setSubscriptionRequests((result.subscription_requests || []).map(formatSubscriptionRequest));
    }

    if (section === "users") {
      setUsers(result.profiles || []);
    }

    setDataMode("secure-api");
    setLastUpdatedAt(new Date().toLocaleTimeString("ar"));
    setRefreshWarning("");
  }, []);

  const loadSection = useCallback(
    async (section, { force = false, background = false } = {}) => {
      const cached = getCachedAdminSection(section);
      const cacheFresh = isAdminSectionCacheFresh(section);

      if (cacheFresh && !force) {
        applySectionResult(section, cached);
        setSectionStates((current) => ({
          ...current,
          [section]: {
            ...current[section],
            loading: false,
            refreshing: false,
            error: "",
            loaded: true,
          },
        }));
        return;
      }

      if (sectionFetchRef.current.has(section) && !force) {
        return;
      }

      if (force) {
        abortControllersRef.current.get(section)?.abort();
      }

      const showStaleWhileRevalidate = Boolean(cached) && (background || force || !cacheFresh);

      if (showStaleWhileRevalidate) {
        applySectionResult(section, cached);
        setSectionStates((current) => ({
          ...current,
          [section]: {
            ...current[section],
            loading: false,
            refreshing: true,
            error: "",
            loaded: true,
          },
        }));
      } else if (!cached) {
        setSectionStates((current) => ({
          ...current,
          [section]: {
            ...createAdminSectionState(),
            ...current[section],
            loading: true,
            refreshing: false,
            error: "",
          },
        }));
      }

      sectionFetchRef.current.add(section);
      const controller = new AbortController();
      abortControllersRef.current.set(section, controller);

      const startedAt = Date.now();
      logAdminSectionLoad("ADMIN_SECTION_LOAD_STARTED", { section });

      try {
        const result = await fetchAdminDashboardSection(adminFetch, section, {
          signal: controller.signal,
        });

        setCachedAdminSection(section, result);
        applySectionResult(section, result);
        logAdminSectionLoad("ADMIN_SECTION_LOAD_FINISHED", {
          section,
          durationMs: result.durationMs ?? Date.now() - startedAt,
          returnedRows: result.returnedRows ?? 0,
        });

        setSectionStates((current) => ({
          ...current,
          [section]: {
            loading: false,
            refreshing: false,
            error: "",
            loaded: true,
            durationMs: result.durationMs ?? null,
            returnedRows: result.returnedRows ?? null,
          },
        }));
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        logAdminSectionLoad("ADMIN_SECTION_LOAD_FAILED", {
          section,
          durationMs: Date.now() - startedAt,
          error: error?.message || "unknown",
        });

        setSectionStates((current) => ({
          ...current,
          [section]: {
            ...current[section],
            loading: false,
            refreshing: false,
            loaded: Boolean(cached),
            error: cached ? "" : error?.message || "فشل تحميل القسم",
          },
        }));
      } finally {
        sectionFetchRef.current.delete(section);
        abortControllersRef.current.delete(section);
      }
    },
    [applySectionResult]
  );

  const refreshGlobalSections = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setIsRefreshing(true);
      }

      ADMIN_SHELL_SECTIONS.forEach((section) => invalidateAdminSectionCache(section));

      await Promise.allSettled(
        ADMIN_SHELL_SECTIONS.map((section) => loadSection(section, { force: true }))
      );

      if (!silent) {
        setIsRefreshing(false);
      }
    },
    [loadSection]
  );

  const refreshActiveTabSections = useCallback(
    async ({ silent = false } = {}) => {
      const sections = getAdminTabRefreshSections(activeAdminTab);
      if (sections.length === 0) {
        return;
      }

      if (!silent) {
        setIsRefreshing(true);
      }

      sections.forEach((section) => invalidateAdminSectionCache(section));

      await Promise.allSettled(
        sections.map((section) => loadSection(section, { force: true }))
      );

      if (!silent) {
        setIsRefreshing(false);
      }
    },
    [activeAdminTab, loadSection]
  );

  useEffect(() => {
    if (!authResolved || !profileReady || !user?.email || !isAdmin) {
      return undefined;
    }

    if (adminInitStartedRef.current) {
      return undefined;
    }

    adminInitStartedRef.current = true;
    let cancelled = false;

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        setBrowserNotificationsEnabled(true);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            setBrowserNotificationsEnabled(true);
          }
        });
      }
    }

    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;

      ADMIN_SHELL_SECTIONS.forEach((section) => {
        const cached = getCachedAdminSection(section);
        void loadSection(section, {
          background: Boolean(cached) && !isAdminSectionCacheFresh(section),
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      ADMIN_SHELL_SECTIONS.forEach((section) => {
        abortControllersRef.current.get(section)?.abort();
      });
    };
  }, [authResolved, profileReady, user?.email, isAdmin, loadSection]);

  useEffect(() => {
    if (!authResolved || !profileReady || !user?.email || !isAdmin) {
      return undefined;
    }

    const sections = mapAdminTabToSections(activeAdminTab);
    if (sections.length === 0) {
      return undefined;
    }

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;

      sections.forEach((section) => {
        const cached = getCachedAdminSection(section);
        void loadSection(section, {
          background: Boolean(cached) && !isAdminSectionCacheFresh(section),
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      sections.forEach((section) => {
        abortControllersRef.current.get(section)?.abort();
      });
    };
  }, [activeAdminTab, authResolved, profileReady, user?.email, isAdmin, loadSection]);

  useVisibilityRefresh(
    () => {
      void refreshGlobalSections({ silent: true });
      void refreshActiveTabSections({ silent: true });
    },
    {
      enabled: authResolved && profileReady && Boolean(user?.email) && isAdmin,
      intervalMs: 60000,
      refreshOnVisible: false,
      refreshOnFocus: false,
    }
  );

  useEffect(() => {
    const pendingSubscriptions = subscriptionRequests.filter(
      (item) => getAdminStatusKey(item.status) === "pending"
    );

    const pendingAccounts = accountRequests.filter(
      (item) => getAdminStatusKey(item.status) === "pending"
    );

    const notifications = [
      ...pendingSubscriptions.map((item) => ({
        id: `subscription-${item.id}`,
        key: "subscription_request",
        title: "طلب اشتراك جديد 💳",
        body: `${item.planName || "اشتراك جديد"} - ${item.userEmail || item.username || "مستخدم"}`,
      })),
      ...pendingAccounts.map((item) => ({
        id: `account-${item.id}`,
        key: "account_management",
        title: "طلب إدارة حساب جديد 📂",
        body: item.email || item.telegram || "طلب جديد",
      })),
    ];

    notifications.forEach((item) => {
      if (isAdminDashboardNotificationAcknowledged(item.id)) return;
      if (isNotificationCenterRendered(item.id)) return;

      void notify({
        key: item.key,
        title: item.title,
        body: item.body,
        url: "/admin",
        persist: false,
        skipBrowser: !browserNotificationsEnabled,
        metadata: { id: item.id },
        source: "admin-dashboard",
      });
    });
  }, [
    browserNotificationsEnabled,
    subscriptionRequests,
    accountRequests,
    adminAcknowledgedVersion,
  ]);

  const updateSubscriptionRequest = async (request, newStatus) => {
    const needsConfirm = newStatus === "مفعل" || newStatus === "مرفوض";

    if (needsConfirm) {
      const confirmed = await confirmAdminAction(
        newStatus === "مفعل"
          ? "هل تريد تفعيل هذا الاشتراك للمستخدم؟"
          : "هل تريد رفض طلب الاشتراك؟"
      );

      if (!confirmed) return;
    }

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update-subscription-request",
          requestId: request.id,
          status: newStatus,
          userEmail: request.userEmail,
          planName: request.planName,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحديث حالة طلب الاشتراك");
      }

      setSubscriptionRequests((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status: newStatus } : item
        )
      );

      if (newStatus === "مفعل") {
        setUsers((prev) =>
          prev.map((user) =>
            user.email === request.userEmail
              ? {
                  ...user,
                  subscription_plan: request.planName,
                  subscription_status: "نشط",
                }
              : user
          )
        );
      }

      showAdminNotice(
        newStatus === "مفعل" ? "تم تفعيل الاشتراك" : "تم تحديث حالة طلب الاشتراك"
      );
    } catch (error) {
      showAdminNotice(error?.message || "تعذر تحديث حالة طلب الاشتراك", "error");
    }
  };

  const stats = useMemo(() => {
    if (apiStats) {
      return {
        pendingAnalysis: apiStats.analysisPending ?? 0,
        completedAnalysis: apiStats.analysisReviewed ?? 0,
        pendingAccounts: apiStats.accountsPending ?? 0,
        pendingSubscriptions: apiStats.subscriptionsPending ?? 0,
        usersCount: apiStats.usersCount ?? 0,
        analysisTotal: apiStats.analysisTotal ?? analysisRequests.length,
        accountsTotal: apiStats.accountsTotal ?? accountRequests.length,
        subscriptionsTotal: apiStats.subscriptionsTotal ?? subscriptionRequests.length,
      };
    }

    const pendingAnalysis = analysisRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;
    const completedAnalysis = analysisRequests.filter((req) => getAdminStatusKey(req.status) === "reviewed").length;
    const pendingAccounts = accountRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;
    const pendingSubscriptions = subscriptionRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;

    return {
      pendingAnalysis,
      completedAnalysis,
      pendingAccounts,
      pendingSubscriptions,
      usersCount: users.length,
      analysisTotal: analysisRequests.length,
      accountsTotal: accountRequests.length,
      subscriptionsTotal: subscriptionRequests.length,
    };
  }, [apiStats, analysisRequests, accountRequests, subscriptionRequests, users]);

  const adminNotifications = useMemo(() => adminFeedNotifications, [adminFeedNotifications]);

  const adminUnreadCount = useMemo(() => {
    void adminAcknowledgedVersion;
    return countUnacknowledgedAdminNotifications(adminNotifications);
  }, [adminNotifications, adminAcknowledgedVersion]);

  const handleAdminNotificationsBellClick = () => {
    setAdminNotificationsOpen((prev) => {
      const next = !prev;

      if (next) {
        requestAnimationFrame(() => updateAdminNotificationsDropdownPosition());
      }

      return next;
    });
  };

  const handleMarkAllAdminNotificationsRead = () => {
    const ids = adminNotifications.map((item) => item.id);
    acknowledgeAdminDashboardNotifications(ids);
    ids.forEach((id) => markNotificationCenterRendered(id));
    setAdminAcknowledgedVersion((value) => value + 1);
  };

  const recentOverviewItems = useMemo(() => {
    if (adminFeedNotifications.length > 0) {
      return adminFeedNotifications.slice(0, 6).map((item) => ({
        id: item.id,
        tab: item.targetTab || item.type,
        icon: item.icon,
        title: item.title,
        message: item.message,
        createdAt: item.createdAt,
      }));
    }

    const items = [
      ...analysisRequests
        .filter((item) => getAdminStatusKey(item.status) === "pending")
        .slice(0, 3)
        .map((item) => ({
          id: `analysis-${item.id}`,
          tab: "analysis",
          icon: "🧠",
          title: `طلب تحليل ${item.coin}`,
          message: `${item.username || item.userEmail || "مستخدم"} · ${item.frame || "—"}`,
          createdAt: item.createdAt,
        })),
      ...accountRequests
        .filter((item) => getAdminStatusKey(item.status) === "pending")
        .slice(0, 3)
        .map((item) => ({
          id: `account-${item.id}`,
          tab: "accounts",
          icon: "📂",
          title: item.type || "طلب إدارة حساب",
          message: item.email || item.telegram || "طلب جديد",
          createdAt: item.createdAt,
        })),
      ...subscriptionRequests
        .filter((item) => getAdminStatusKey(item.status) === "pending")
        .slice(0, 3)
        .map((item) => ({
          id: `subscription-${item.id}`,
          tab: "subscriptions",
          icon: "💳",
          title: item.planName || "طلب اشتراك",
          message: `${item.userEmail || item.username || "مستخدم"} · ${item.price || "—"}`,
          createdAt: item.createdAt,
        })),
    ];

    return items.slice(0, 6);
  }, [adminFeedNotifications, analysisRequests, accountRequests, subscriptionRequests]);

  const filteredAnalysis = useMemo(() => {
    let list = analysisRequests.filter((req) => matchesAdminStatusFilter(req.status, filter));

    return list.filter((req) =>
      matchesAdminSearch(req, analysisSearch, ["coin", "frame", "userEmail", "username", "status"])
    );
  }, [analysisRequests, filter, analysisSearch]);

  const filteredSubscriptions = useMemo(() => {
    let list = subscriptionRequests.filter((req) =>
      matchesAdminStatusFilter(req.status, subscriptionFilter)
    );

    return list.filter((req) =>
      matchesAdminSearch(req, subscriptionSearch, [
        "planName",
        "category",
        "price",
        "telegramUsername",
        "userEmail",
        "username",
        "status",
      ])
    );
  }, [subscriptionRequests, subscriptionFilter, subscriptionSearch]);

  const filteredAccounts = useMemo(() => {
    let list = accountRequests.filter((req) => matchesAdminStatusFilter(req.status, accountFilter));

    return list.filter((req) =>
      matchesAdminSearch(req, accountSearch, [
        "type",
        "platform",
        "email",
        "telegram",
        "capital",
        "notes",
        "status",
      ])
    );
  }, [accountRequests, accountFilter, accountSearch]);

  const logoutAdmin = async () => {
    await logout();
    router.replace("/login");
  };

  const statsPending = !sectionStates.stats.loaded && !sectionStates.stats.error;
  const overviewPending = !sectionStates.overview.loaded && !sectionStates.overview.error;
  const analysisPending = !sectionStates.analysis.loaded && !sectionStates.analysis.error;
  const accountsPending = !sectionStates.accounts.loaded && !sectionStates.accounts.error;
  const subscriptionsPending = !sectionStates.subscriptions.loaded && !sectionStates.subscriptions.error;


  const publishVipSignal = async (signalType) => {
    if (!vipSignalForm.coin.trim()) {
      showAdminNotice("اكتب اسم العملة أولاً", "error", "تنبيه");
      return;
    }

    const confirmed = await confirmAdminAction(
      signalType === "spot"
        ? "هل تريد نشر توصية VIP Spot؟"
        : "هل تريد نشر توصية VIP Futures؟"
    );

    if (!confirmed) return;

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "publish-vip-signal",
          requestId: `vip-${Date.now()}`,
          signalType,
          coin: vipSignalForm.coin.trim().toUpperCase(),
          entry: vipSignalForm.entry.trim(),
          targets: vipSignalForm.targets.trim(),
          stopLoss: vipSignalForm.stop_loss.trim(),
          notes: vipSignalForm.notes.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "فشل نشر توصية VIP");
      }

      showAdminNotice(
        signalType === "spot"
          ? "تم نشر توصية VIP Spot"
          : "تم نشر توصية VIP Futures"
      );

      setVipSignalForm({
        signal_type: signalType,
        coin: "",
        entry: "",
        targets: "",
        stop_loss: "",
        notes: "",
      });
    } catch (error) {
      showAdminNotice(error?.message || "فشل نشر توصية VIP", "error");
    }
  };

  const sendAnalysisReply = async (id) => {
    const data = replies[id];

    if (!data?.text || data.text.trim() === "") {
      showAdminNotice("اكتب الرد أولاً", "error", "تنبيه");
      return;
    }

    if (replySending[id]) return;

    const targetRequest = analysisRequests.find((req) => req.id === id);
    const replyText = data.text.trim();
    const replyImage = data.image || targetRequest?.replyImage || "";

    setReplySending((prev) => ({ ...prev, [id]: true }));

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "send-analysis-reply",
          requestId: id,
          reply: replyText,
          replyImage,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "فشل إرسال الرد");
      }

      setAnalysisRequests((prev) =>
        prev.map((req) =>
          req.id === id
            ? {
                ...req,
                status: "تم الرد",
                reply: replyText,
                replyImage,
                repliedAt: new Date().toLocaleString("ar"),
              }
            : req
        )
      );

      setReplies((prev) => ({ ...prev, [id]: { text: "", image: "" } }));
      setExpandedAnalysis((prev) => ({ ...prev, [id]: false }));

      showAdminNotice("تم إرسال الرد بنجاح ✅");
    } catch (err) {
      console.error("Admin reply error:", err);
      showAdminNotice(err?.message || "حدث خطأ أثناء إرسال الرد", "error");
    } finally {
      setReplySending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleReplyImage = (id, file) => {
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");

          const maxWidth = 3840;
          const scale = Math.min(maxWidth / img.width, 1);

          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                showAdminNotice("تعذر ضغط الصورة", "error");
                return;
              }

              const compressedReader = new FileReader();

              compressedReader.onloadend = () => {
                setReplies((prev) => ({
                  ...prev,
                  [id]: {
                    ...prev[id],
                    image: compressedReader.result,
                  },
                }));

                showAdminNotice("تم تجهيز الصورة بنجاح ✅");
              };

              compressedReader.onerror = () => {
                showAdminNotice("تعذر تجهيز الصورة", "error");
              };

              compressedReader.readAsDataURL(blob);
            },
            "image/png"
          );
        } catch (err) {
          console.error("Image upload error:", err);
          showAdminNotice("حدث خطأ أثناء تجهيز الصورة", "error");
        }
      };

      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  };

  const deleteAnalysisRequest = async (id) => {
    if (!(await confirmAdminAction("هل تريد حذف طلب التحليل؟"))) return;

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete-analysis-request",
          requestId: id,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حذف طلب التحليل");
      }

      setAnalysisRequests((prev) => prev.filter((req) => req.id !== id));
      showAdminNotice("تم حذف طلب التحليل");
    } catch (error) {
      showAdminNotice(error?.message || "تعذر حذف طلب التحليل", "error");
    }
  };

  const approveAccountRequest = async (id) => {
    await updateRequestStatus("account_management_requests", id, "reviewed");
  };

  const deleteAccountRequest = async (id) => {
    if (!(await confirmAdminAction("هل تريد حذف طلب إدارة الحساب؟"))) return;

    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete-account-request",
          requestId: id,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حذف الطلب");
      }

      setAccountRequests((prev) => prev.filter((req) => req.id !== id));
    } catch (error) {
      showAdminNotice(error?.message || "تعذر حذف الطلب", "error");
    }
  };


  return (
    <main className="admin-theme-page relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <AppModal
        open={adminNotice.open}
        type={adminNotice.type === "error" ? "error" : "success"}
        title={adminNotice.title}
        message={adminNotice.message}
        onClose={() => setAdminNotice((current) => ({ ...current, open: false }))}
      />

      {proofPreview && isValidPreviewUrl(proofPreview) && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-auto fixed inset-0 z-[200] flex flex-col bg-slate-950/75 backdrop-blur-md"
              onClick={() => setProofPreview(null)}
            >
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-cyan-300/15 bg-black/30 px-4 py-4 md:px-6">
                <p className="text-lg font-black">معاينة الصورة</p>
                <button
                  type="button"
                  onClick={() => setProofPreview(null)}
                  className="admin-btn-surface px-6 py-3"
                >
                  إغلاق
                </button>
              </div>
              <div
                className="flex flex-1 items-center justify-center overflow-auto p-4 md:p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={proofPreview}
                  alt="معاينة الصورة"
                  width={1400}
                  height={1000}
                  sizes="100vw"
                  className="max-h-[calc(100vh-88px)] max-w-full rounded-2xl border border-cyan-300/15 bg-black/20 object-contain shadow-[0_20px_70px_rgba(14,165,233,0.2)]"
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {adminNotificationsOpen &&
      adminNotificationsDropdownStyle &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              ref={adminNotificationsPanelRef}
              className="admin-notifications-dropdown admin-notifications-dropdown--portal"
              style={{
                position: "fixed",
                top: adminNotificationsDropdownStyle.top,
                left: adminNotificationsDropdownStyle.left,
                width: adminNotificationsDropdownStyle.width,
                zIndex: 9999,
              }}
              role="dialog"
              aria-label="إشعارات الأدمن"
            >
              <div className="admin-notifications-dropdown__header">
                <div>
                  <p className="admin-notifications-dropdown__title">إشعارات الأدمن</p>
                  <p className="admin-notifications-dropdown__meta">
                    {adminNotifications.length} إشعار
                    {adminUnreadCount > 0 ? ` · ${adminUnreadCount} جديد` : ""}
                  </p>
                </div>
                <div className="admin-notifications-panel__actions">
                  <button
                    type="button"
                    onClick={() => void loadSection("overview", { force: true })}
                    className="admin-notifications-panel__action"
                  >
                    تحديث
                  </button>
                  {adminUnreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleMarkAllAdminNotificationsRead}
                      className="admin-notifications-panel__action"
                    >
                      مقروء
                    </button>
                  ) : null}
                </div>
              </div>

              {adminNotifications.length === 0 ? (
                <div className="admin-notifications-dropdown__empty">
                  لا توجد إشعارات جديدة حالياً
                </div>
              ) : (
                <div className="admin-notifications-dropdown__list">
                  {adminNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAdminNotificationsOpen(false);
                          if (item.type === "subscription") {
                            setSubscriptionFilter("pending");
                            setActiveAdminTab("subscriptions");
                          }
                          if (item.type === "account") {
                            setAccountFilter("pending");
                            setActiveAdminTab("accounts");
                          }
                          if (item.type === "analysis") {
                            setFilter("pending");
                            setActiveAdminTab("analysis");
                          }
                          if (item.type === "withdrawal") {
                            window.location.href = item.url || "/admin/partners";
                          }
                        }}
                        className="admin-notifications-dropdown__item"
                      >
                        <span className="admin-notifications-dropdown__icon">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="admin-notifications-dropdown__item-title">{item.title}</p>
                            {!isAdminDashboardNotificationAcknowledged(item.id) && (
                              <span className="admin-notifications-dropdown__badge">جديد</span>
                            )}
                          </div>
                          <p className="admin-notifications-dropdown__item-message">{item.message}</p>
                          {item.createdAt ? (
                            <p className="admin-notifications-dropdown__item-time">{item.createdAt}</p>
                          ) : null}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>,
            document.body
          )
        : null}

      <AppModal
        open={adminConfirm.open}
        type="warning"
        title="تأكيد العملية"
        message={adminConfirm.message}
        mode="confirm"
        confirmText="تأكيد"
        cancelText="إلغاء"
        onConfirm={() => closeAdminConfirm(true)}
        onCancel={() => closeAdminConfirm(false)}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-20 space-y-8 p-4 text-slate-100 md:p-6">
        {refreshWarning && (
          <div className="admin-warning-banner">
            <span>{refreshWarning}</span>
            <button
              type="button"
              onClick={() => setRefreshWarning("")}
              className="admin-warning-banner__btn"
            >
              إغلاق
            </button>
          </div>
        )}

        <section className="relative overflow-visible rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-7 md:p-9 shadow-2xl backdrop-blur-2xl">
          <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100">
                ADMIN CONTROL CENTER
              </span>
              <h1 className="mt-5 text-4xl font-black leading-tight md:text-5xl">لوحة الإدارة</h1>
              <p className="mt-4 max-w-3xl leading-8 text-slate-200">
                إدارة طلبات التحليل، إرسال الردود مع الصور، ومراجعة طلبات إدارة الحسابات من مكان واحد. يتم تحديث الطلبات لحظيًا بدون إعادة تحميل اللوحة كاملة.
              </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-4 text-sm text-slate-200 shadow-2xl backdrop-blur-2xl">
          <span className="font-bold text-cyan-100">
            {isRefreshing ? "جاري تحديث بيانات اللوحة..." : "التحديث اللحظي مفعل"}
          </span>
          <span className="text-slate-300">
            {lastUpdatedAt ? `آخر تحديث: ${lastUpdatedAt}` : "بانتظار أول تحديث"}
          </span>
          <button
            onClick={() => {
              void refreshGlobalSections();
            }}
            className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 font-black text-cyan-100 transition hover:bg-cyan-400/20"
          >
            تحديث الآن
          </button>
        </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative" ref={adminNotificationsRef}>
                <button
                  ref={adminNotificationsBellRef}
                  type="button"
                  onClick={handleAdminNotificationsBellClick}
                  className="relative rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-6 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  🔔 إشعارات الأدمن
                  {adminUnreadCount > 0 && (
                    <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_22px_rgba(239,68,68,0.55)]">
                      {adminUnreadCount}
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={logoutAdmin}
                className="rounded-2xl border border-red-400/20 bg-red-500/15 px-6 py-4 font-black text-red-100 transition hover:bg-red-500/25"
              >
                تسجيل خروج الأدمن
              </button>
            </div>
          </div>
        </section>

        <section className="admin-section p-5 md:p-6">
          {adminUnreadCount > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
              يوجد {adminUnreadCount} طلبات جديدة تحتاج مراجعة
            </div>
          )}

          <div className="flex flex-col gap-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Admin Command Center</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-800">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    Online / Active
                  </span>
                  <span className="text-sm text-slate-600">
                    آخر تحديث:{" "}
                    <span className="font-black">
                      {lastUpdatedAt || "بانتظار أول تحديث"}
                    </span>
                  </span>
                  {isRefreshing && (
                    <span className="text-sm font-bold text-cyan-700">جاري التحديث...</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  void refreshGlobalSections();
                }}
                className="shrink-0 rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-[0_14px_38px_rgba(37,99,235,0.28)] transition hover:brightness-110"
              >
                تحديث الآن
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3 flex justify-end">
                <AdminSectionRefreshingIndicator visible={sectionStates.stats.refreshing} />
              </div>
              {statsPending ? (
                <AdminQuickStatsSkeleton />
              ) : sectionStates.stats.error ? (
                <div className="sm:col-span-3">
                  <AdminSectionError
                    message={sectionStates.stats.error}
                    onRetry={() => void loadSection("stats", { force: true })}
                  />
                </div>
              ) : (
                <>
              <div className="admin-stat-chip">
                <p className="text-xs font-bold text-slate-600">طلبات التحليل المنتظرة</p>
                <p className="mt-1 admin-heading text-2xl">{stats.pendingAnalysis}</p>
              </div>
              <div className="admin-stat-chip">
                <p className="text-xs font-bold text-slate-600">إدارة الحسابات المنتظرة</p>
                <p className="mt-1 admin-heading text-2xl">{stats.pendingAccounts}</p>
              </div>
              <div className="admin-stat-chip">
                <p className="text-xs font-bold text-slate-600">طلبات الاشتراك المنتظرة</p>
                <p className="mt-1 admin-heading text-2xl">{stats.pendingSubscriptions}</p>
              </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {ADMIN_TABS.filter((tab) => tab.id !== "overview").map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveAdminTab(tab.id)}
                  className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition ${
                    tab.id === "vip"
                      ? "border-blue-200 bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 text-white shadow-[0_10px_28px_rgba(37,99,235,0.22)] hover:brightness-110"
                      : "admin-filter-btn admin-filter-btn--active"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-section p-3 md:p-4">
          <div className="flex flex-wrap gap-2">
            {ADMIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveAdminTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                  activeAdminTab === tab.id
                    ? "border-cyan-300 bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 text-white shadow-[0_12px_32px_rgba(37,99,235,0.28)]"
                    : "border-cyan-100 bg-white/90 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50"
                }`}
              >
                <span className="ml-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeAdminTab === "overview" && (
          <div className="relative flex flex-col gap-5">
        {statsPending ? (
          <AdminStatsGridSkeleton />
        ) : sectionStates.stats.error ? (
          <AdminSectionError
            message={sectionStates.stats.error}
            onRetry={() => void loadSection("stats", { force: true })}
          />
        ) : (
        <>
        <div className="order-1 flex justify-end">
          <AdminSectionRefreshingIndicator visible={sectionStates.stats.refreshing} />
        </div>
        <section className="order-1 grid gap-5 md:grid-cols-2 xl:grid-cols-6">
          <AdminStat title="طلبات التحليل" value={stats.analysisTotal} icon="🧠" subtitle="إجمالي الطلبات" />
          <AdminStat title="بانتظار الرد" value={stats.pendingAnalysis} icon="⏳" subtitle="طلبات تحتاج متابعة" tone="orange" />
          <AdminStat title="تم إنجازها" value={stats.completedAnalysis} icon="✅" subtitle="طلبات مكتملة" tone="green" />
          <AdminStat title="إدارة الحسابات" value={stats.accountsTotal} icon="📂" subtitle="طلبات العملاء" tone="red" />
          <AdminStat title="المستخدمون" value={stats.usersCount} icon="👥" subtitle={dataMode === "secure-api" ? "من Secure API" : dataMode === "supabase" ? "من Supabase" : "محلياً للتجربة"} tone="green" />
          <AdminStat title="طلبات الاشتراك" value={stats.subscriptionsTotal} icon="💳" subtitle={`${stats.pendingSubscriptions} بانتظار التفعيل`} tone="orange" />
        </section>
        </>
        )}

        <nav className="order-2 relative z-[120] grid gap-5" aria-label="أدوات الإدارة">
          <AdminOverviewNavLink
            href="/admin/partners"
            gradientClass="from-emerald-500/20 to-cyan-400/10"
            hoverClasses="hover:border-emerald-300/35 hover:bg-white/[0.08] hover:shadow-[0_0_48px_rgba(16,185,129,0.18)]"
            eyebrow="Partner Program"
            title="🤝 إدارة الشركاء"
            description="إحصائيات الشركاء، التفاصيل، وطلبات السحب"
            icon="🤝"
          />
          <AdminOverviewNavLink
            href="/admin/email-analytics"
            gradientClass="from-blue-500/20 to-cyan-400/10"
            hoverClasses="hover:border-cyan-300/30 hover:bg-white/[0.06] hover:shadow-[0_0_40px_rgba(34,211,238,0.12)]"
            eyebrow="Email Analytics"
            title="📧 مراقبة الإيميلات"
            description="تتبع التسليم، الفتح، النقر، والأخطاء عبر Resend"
            icon="📧"
          />
          <AdminOverviewNavLink
            href="/admin/notification-test"
            gradientClass="from-violet-500/20 to-cyan-400/10"
            hoverClasses="hover:border-violet-300/35 hover:bg-white/[0.08] hover:shadow-[0_0_48px_rgba(139,92,246,0.22)]"
            eyebrow="Notification Test Center"
            title="🔔 اختبار الإشعارات"
            description="إرسال حقيقي عبر دوال الإنتاج لكل نوع إشعار (Hub + Push + Email)"
            icon="🔔"
          />
        </nav>

        {overviewPending ? (
          <AdminRecentItemsSkeleton />
        ) : sectionStates.overview.error ? (
          <AdminSectionError
            message={sectionStates.overview.error}
            onRetry={() => void loadSection("overview", { force: true })}
          />
        ) : (
        <section className="order-3 relative z-0 admin-section p-5 md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="admin-heading text-2xl">آخر الطلبات الجديدة</h2>
              <p className="mt-2 text-sm font-bold text-slate-600">أحدث الطلبات التي تحتاج متابعة سريعة.</p>
            </div>
            <div className="flex items-center gap-2">
              <AdminSectionRefreshingIndicator visible={sectionStates.overview.refreshing} />
              <button
                type="button"
                onClick={() => void loadSection("overview", { force: true })}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200 transition hover:bg-cyan-400/20"
              >
                تحديث القسم
              </button>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                {recentOverviewItems.length} طلب
              </span>
            </div>
          </div>

          {recentOverviewItems.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-400/5 p-8 text-center">
              <p className="text-3xl">✅</p>
              <p className="mt-3 font-black">لا توجد طلبات جديدة حالياً</p>
            </div>
          ) : (
            <div className="admin-scroll-panel admin-scroll-panel--list mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentOverviewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveAdminTab(item.tab);
                    if (item.tab === "analysis") setFilter("pending");
                    if (item.tab === "accounts") setAccountFilter("pending");
                    if (item.tab === "subscriptions") setSubscriptionFilter("pending");
                  }}
                  className="admin-inline-panel text-right transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl">
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{item.title}</p>
                      <p className="mt-1 text-sm font-bold text-slate-600">{item.message}</p>
                      {item.createdAt && (
                        <p className="mt-2 text-xs font-bold text-slate-400">{item.createdAt}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        )}
          </div>
        )}

        {activeAdminTab === "user-management" && <AdminUserManagementPanel />}

        {activeAdminTab === "vip" && (
        <section className="space-y-5">
          <div>
            <h2 className="text-3xl font-black">نشر توصيات VIP</h2>
            <p className="mt-2 text-slate-400">أضف توصية منفصلة لمشتركي Spot أو Futures فقط.</p>
          </div>

          <div className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <input
                value={vipSignalForm.coin}
                onChange={(e) => setVipSignalForm((prev) => ({ ...prev, coin: e.target.value }))}
                placeholder="العملة مثل BTCUSDT"
                className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />

              <input
                value={vipSignalForm.entry}
                onChange={(e) => setVipSignalForm((prev) => ({ ...prev, entry: e.target.value }))}
                placeholder="منطقة الدخول"
                className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />

              <input
                value={vipSignalForm.targets}
                onChange={(e) => setVipSignalForm((prev) => ({ ...prev, targets: e.target.value }))}
                placeholder="الأهداف"
                className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />

              <input
                value={vipSignalForm.stop_loss}
                onChange={(e) => setVipSignalForm((prev) => ({ ...prev, stop_loss: e.target.value }))}
                placeholder="وقف الخسارة"
                className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />

              <textarea
                value={vipSignalForm.notes}
                onChange={(e) => setVipSignalForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات التوصية"
                className="min-h-28 rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10 md:col-span-2"
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => publishVipSignal("spot")}
                className="rounded-2xl bg-gradient-to-l from-amber-600 via-yellow-500 to-amber-300 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(245,158,11,0.35)] transition hover:scale-[1.01] hover:brightness-110"
              >
                نشر توصية VIP Spot ⭐
              </button>

              <button
                onClick={() => publishVipSignal("futures")}
                className="rounded-2xl bg-gradient-to-l from-fuchsia-700 via-purple-600 to-pink-400 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(192,38,211,0.35)] transition hover:scale-[1.01] hover:brightness-110"
              >
                نشر توصية VIP Futures 🔥
              </button>
            </div>
          </div>
        </section>
        )}

        {activeAdminTab === "daily-publish" && <DailyAnalysisPublishPanel />}

        {activeAdminTab === "analysis" && (
          <>
        {analysisPending ? (
          <AdminRequestsPanelSkeleton />
        ) : sectionStates.analysis.error ? (
          <AdminSectionError
            message={sectionStates.analysis.error}
            onRetry={() => void loadSection("analysis", { force: true })}
          />
        ) : (
          <>
        <section className="admin-section p-4 md:p-5">
          <div className="flex flex-wrap gap-3">
            {ADMIN_STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                  filter === key
                    ? "admin-filter-btn admin-filter-btn--active"
                    : "admin-filter-btn admin-filter-btn--idle"
                }`}
              >
                {label} ({countAdminStatusFilter(analysisRequests, key)})
              </button>
            ))}
          </div>
          <div className="mt-4">
            <input
              value={analysisSearch}
              onChange={(e) => setAnalysisSearch(e.target.value)}
              placeholder="بحث في طلبات التحليل: العملة، الفريم، البريد، المستخدم، الحالة..."
              className="admin-field font-bold"
            />
          </div>
        </section>

        <section id="analysis-requests" className="space-y-5 scroll-mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="admin-heading text-3xl">طلبات تحليل العملات</h2>
              <p className="mt-2 text-slate-600">اكتب الرد وارفق صورة الشارت ثم أرسلها للمستخدم.</p>
            </div>
            <div className="flex items-center gap-2">
              <AdminSectionRefreshingIndicator visible={sectionStates.analysis.refreshing} />
              <button
                type="button"
                onClick={() => void refreshActiveTabSections()}
                className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
              >
                تحديث التبويب
              </button>
            </div>
          </div>

          {filteredAnalysis.length === 0 ? (
            <div className="admin-section admin-card--dashed p-10 text-center">
              <div className="admin-empty-icon">📭</div>
              <h3 className="admin-heading text-2xl">لا توجد طلبات تحليل حالياً</h3>
            </div>
          ) : (
            <div className="admin-scroll-panel admin-scroll-panel--cards-lg grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAnalysis.map((req) => (
                <article
                  key={req.id}
                  className="admin-section admin-card flex min-w-0 flex-col overflow-hidden p-5"
                >
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 break-words admin-heading text-2xl leading-tight md:text-3xl">
                        {req.coin}
                      </h3>
                      <StatusBadge status={req.status} />
                    </div>

                    <div className="flex min-w-0 flex-wrap gap-2 text-sm">
                      <span className="admin-chip">
                        المستخدم: <b>{req.username || req.userEmail}</b>
                      </span>
                      <span className="admin-chip">
                        الفريم: <b>{req.frame}</b>
                      </span>
                      <span className="admin-chip">
                        التاريخ: <b>{req.createdAt}</b>
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAnalysis((prev) => ({
                            ...prev,
                            [req.id]: !prev[req.id],
                          }))
                        }
                        className="admin-btn-surface w-full shrink-0 px-5 py-3 text-center text-sm sm:w-[168px]"
                      >
                        {expandedAnalysis[req.id] ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                      </button>
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("analysis_requests", req.id, e.target.value)}
                        className="min-w-0 flex-1 admin-field font-black"
                      >
                        {SIMPLE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => updateRequestStatus("analysis_requests", req.id, "reviewed")}
                        className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(16,185,129,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        تمت المراجعة
                      </button>
                    </div>

                    {!expandedAnalysis[req.id] && req.reply && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-800 shadow-[0_10px_28px_rgba(16,185,129,0.12)]">
                        تم الرد على هذا الطلب ✅
                      </div>
                    )}

                    {expandedAnalysis[req.id] && (
                      <div className="min-w-0 space-y-5 border-t border-cyan-100 pt-5">

                    {req.reply && (
                      <div className="admin-inline-panel">
                        <p className="text-sm font-bold text-slate-800">الرد الحالي</p>
                        <p className="mt-2 break-words leading-8">{req.reply}</p>
                        {isValidPreviewUrl(req.replyImage) && (
                          <button
                            type="button"
                            onClick={() => setProofPreview(req.replyImage)}
                            className="mt-4 block w-full overflow-hidden rounded-2xl border border-cyan-100 bg-slate-50 p-2 transition hover:border-cyan-200 hover:shadow-[0_12px_40px_rgba(14,165,233,0.14)]"
                            title="عرض صورة التحليل"
                          >
                            <Image
                              src={req.replyImage}
                              width={900}
                              height={650}
                              sizes="(max-width: 768px) 100vw, 600px"
                              className="max-h-[260px] w-full cursor-pointer rounded-xl object-contain"
                              alt="صورة التحليل"
                            />
                          </button>
                        )}
                      </div>
                    )}

                    <textarea
                      value={replies[req.id]?.text || ""}
                      onChange={(e) =>
                        setReplies((prev) => ({
                          ...prev,
                          [req.id]: {
                            ...prev[req.id],
                            text: e.target.value,
                          },
                        }))
                      }
                      placeholder="اكتب تحليل العملة هنا..."
                      className="min-h-32 admin-field transition"
                    />

                    <div className="rounded-[24px] admin-inline-panel">
                      <label className="block text-sm font-bold text-slate-800">أرفق صورة التحليل / الشارت</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleReplyImage(req.id, e.target.files[0])}
                        className="mt-3 w-full min-w-0 admin-field p-3"
                      />

                      {isValidPreviewUrl(replies[req.id]?.image) && (
                        <button
                          type="button"
                          onClick={() => setProofPreview(replies[req.id].image)}
                          className="mt-4 block w-full overflow-hidden rounded-2xl border border-cyan-100 bg-slate-50 p-2 transition hover:border-cyan-200"
                          title="معاينة الصورة"
                        >
                          <Image
                            src={replies[req.id].image}
                            width={900}
                            height={650}
                            sizes="(max-width: 768px) 100vw, 600px"
                            className="max-h-[220px] w-full cursor-pointer rounded-xl object-contain"
                            alt="معاينة الصورة"
                          />
                        </button>
                      )}
                    </div>

                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => sendAnalysisReply(req.id)}
                        disabled={replySending[req.id]}
                        className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {replySending[req.id] ? "جاري الإرسال..." : "إرسال الرد"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteAnalysisRequest(req.id)}
                        className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-800 transition hover:bg-red-100"
                      >
                        حذف الطلب
                      </button>
                    </div>
                  </div>
                )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        )}
          </>
        )}

        {activeAdminTab === "accounts" && (
        accountsPending ? (
          <AdminRequestsPanelSkeleton />
        ) : sectionStates.accounts.error ? (
          <AdminSectionError
            message={sectionStates.accounts.error}
            onRetry={() => void loadSection("accounts", { force: true })}
          />
        ) : (
        <section className="space-y-5 scroll-mt-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
            <h2 className="admin-heading text-3xl">طلبات إدارة الحسابات</h2>
            <p className="mt-2 text-slate-600">مراجعة طلبات إدارة المحافظ والحسابات من العملاء.</p>
            </div>
            <div className="flex items-center gap-2">
              <AdminSectionRefreshingIndicator visible={sectionStates.accounts.refreshing} />
              <button
                type="button"
                onClick={() => void refreshActiveTabSections()}
                className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
              >
                تحديث التبويب
              </button>
            </div>
          </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {ADMIN_STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAccountFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    accountFilter === key
                      ? "admin-filter-btn admin-filter-btn--active"
                      : "admin-filter-btn admin-filter-btn--idle"
                  }`}
                >
                  {label} ({countAdminStatusFilter(accountRequests, key)})
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="بحث في إدارة الحسابات: البريد، التليجرام، المنصة، رأس المال، الحالة..."
                className="admin-field font-bold"
              />
            </div>

          {filteredAccounts.length === 0 ? (
            <div className="admin-section admin-card--dashed p-10 text-center">
              <div className="admin-empty-icon">📂</div>
              <h3 className="admin-heading text-2xl">لا توجد طلبات إدارة حسابات حالياً</h3>
            </div>
          ) : (
            <div className="admin-scroll-panel admin-scroll-panel--cards-lg grid gap-5">
              {filteredAccounts.map((req) => {
                const revealedKeys = accountKeys[req.id];

                return (
                <article key={req.id} className="admin-section admin-card p-6">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="admin-heading text-2xl">{req.type}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{req.createdAt}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("account_management_requests", req.id, e.target.value)}
                        className="admin-field font-black"
                      >
                        {SIMPLE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {req.hasSensitiveKeys ? (
                        <button
                          onClick={() => loadAccountKeys(req.id)}
                          disabled={accountKeysLoading[req.id]}
                          className="rounded-2xl bg-gradient-to-l from-sky-800 via-cyan-600 to-blue-400 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(14,165,233,0.32)] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {accountKeysLoading[req.id]
                            ? "جاري العرض..."
                            : revealedKeys
                            ? "إخفاء المفاتيح"
                            : "عرض المفاتيح الحساسة"}
                        </button>
                      ) : null}

                      <button
                        onClick={() => approveAccountRequest(req.id)}
                        className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(16,185,129,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        تمت المراجعة
                      </button>

                      <button
                        onClick={() => deleteAccountRequest(req.id)}
                        className="rounded-2xl bg-gradient-to-l from-red-800 via-red-600 to-rose-400 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(239,68,68,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {[{
                      label: "تيليجرام",
                      value: req.telegram,
                    }, {
                      label: "البريد الإلكتروني",
                      value: req.email,
                    }, {
                      label: "المنصة",
                      value: req.platform,
                    }, {
                      label: "رأس المال",
                      value: req.capital ? `$${req.capital}` : "",
                    }, {
                      label: "API Key",
                      value: revealedKeys?.apiKey || req.apiKey,
                    }, {
                      label: "Secret Key",
                      value: revealedKeys?.secretKey || req.secretKey,
                    }, {
                      label: "رقم الحساب",
                      value: req.account,
                    }, {
                      label: "كلمة المرور",
                      value: revealedKeys?.tradingPassword || req.password,
                    }, {
                      label: "الخادم",
                      value: req.server,
                    }, {
                      label: "الصورة",
                      value: req.fileName,
                    }]
                      .filter((item) => item.value)
                      .map((item) => (
                        <div key={item.label} className="admin-inline-panel">
                          <p className="text-xs font-bold text-slate-800">{item.label}</p>
                          <p className="mt-2 break-all font-bold">{item.value}</p>
                        </div>
                      ))}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
        ))}

        {activeAdminTab === "subscriptions" && (
        subscriptionsPending ? (
          <AdminRequestsPanelSkeleton />
        ) : sectionStates.subscriptions.error ? (
          <AdminSectionError
            message={sectionStates.subscriptions.error}
            onRetry={() => void loadSection("subscriptions", { force: true })}
          />
        ) : (
        <section className="space-y-5 scroll-mt-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
            <h2 className="admin-heading text-3xl">طلبات الاشتراكات والدفع</h2>
            <p className="mt-2 text-slate-600">مراجعة طلبات اشتراك Spot & Futures وتفعيلها للمستخدمين.</p>
            </div>
            <div className="flex items-center gap-2">
              <AdminSectionRefreshingIndicator visible={sectionStates.subscriptions.refreshing} />
              <button
                type="button"
                onClick={() => void refreshActiveTabSections()}
                className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
              >
                تحديث التبويب
              </button>
            </div>
          </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {ADMIN_STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSubscriptionFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    subscriptionFilter === key
                      ? "admin-filter-btn admin-filter-btn--active"
                      : "admin-filter-btn admin-filter-btn--idle"
                  }`}
                >
                  {label} ({countAdminStatusFilter(subscriptionRequests, key)})
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                value={subscriptionSearch}
                onChange={(e) => setSubscriptionSearch(e.target.value)}
                placeholder="بحث في الاشتراكات: الباقة، البريد، المستخدم، التليجرام، السعر، الحالة..."
                className="admin-field font-bold"
              />
            </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="admin-section admin-card--dashed p-10 text-center">
              <div className="admin-empty-icon">💳</div>
              <h3 className="admin-heading text-2xl">لا توجد طلبات اشتراك حالياً</h3>
            </div>
          ) : (
            <div className="admin-scroll-panel admin-scroll-panel--cards-lg grid gap-5">
              {filteredSubscriptions.map((req) => (
                <article key={req.id} className="admin-section admin-card p-6">
                  <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="admin-heading text-2xl">{req.planName}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="admin-chip">
                          المستخدم: <b>{req.username || req.userEmail}</b>
                        </span>
                        <span className="admin-chip">
                          النوع: <b>{req.category}</b>
                        </span>
                        <span className="admin-chip">
                          السعر: <b>{req.price}</b>
                        </span>
                        {req.telegramUsername && (
                          <span className="admin-chip">
                            تليجرام: <b>{req.telegramUsername}</b>
                          </span>
                        )}
                        <span className="admin-chip">
                          التاريخ: <b>{req.createdAt}</b>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("subscription_requests", req.id, e.target.value)}
                        className="admin-field font-black"
                      >
                        {SIMPLE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => updateRequestStatus("subscription_requests", req.id, "reviewed")}
                        className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(16,185,129,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        تمت المراجعة
                      </button>
                      <button
                        onClick={() => updateSubscriptionRequest(req, "مفعل")}
                        className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(16,185,129,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        تفعيل الاشتراك
                      </button>
                    </div>
                  </div>
                  {(req.telegramUsername || isValidPreviewUrl(req.paymentProof)) && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {req.telegramUsername && (
                        <div className="admin-inline-panel">
                          <p className="text-xs font-bold text-slate-800">يوزر التليجرام</p>
                          <p className="mt-2 break-all font-bold">{req.telegramUsername}</p>
                        </div>
                      )}

                      {isValidPreviewUrl(req.paymentProof) && (
                        <div className="admin-inline-panel">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-800">إثبات الدفع</p>
                              <p className="mt-2 font-bold">صورة إشعار الدفع مرفقة</p>
                              <p className="mt-1 text-xs font-bold text-slate-800">اضغط على الصورة أو زر فتح الصورة لعرضها بدقة كاملة.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setProofPreview(req.paymentProof)}
                              className="shrink-0 rounded-xl bg-gradient-to-l from-blue-700 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:brightness-110"
                            >
                              فتح الصورة
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProofPreview(req.paymentProof)}
                            className="mt-4 block w-full overflow-hidden rounded-2xl border border-cyan-100 bg-slate-50 p-2 transition hover:border-cyan-200 hover:shadow-[0_16px_45px_rgba(14,165,233,0.14)]"
                            title="عرض إثبات الدفع بدقة كاملة"
                          >
                            <Image
                              src={req.paymentProof}
                              alt="إثبات الدفع"
                              width={900}
                              height={700}
                              sizes="(max-width: 768px) 100vw, 600px"
                              className="max-h-[340px] w-full cursor-pointer rounded-xl object-contain"
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        ))}
      </div>
    </main>
  );
}
