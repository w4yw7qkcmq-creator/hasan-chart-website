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
  isNewPendingSubscriptionRequest,
  isValidPreviewUrl,
  matchesAdminSearch,
  matchesAdminStatusFilter,
} from "./admin-dashboard-helpers";
import {
  buildSubscriptionRequestCreatedNotificationId,
  dispatchAdminSubscriptionRemovedEvent,
  markAdminSubscriptionEndedNotificationSent,
  resolveAdminSubscriptionEndedNotifyDecision,
} from "../../../lib/admin-subscription-remove-client";
import {
  dispatchAdminSubscriptionUpdatedEvent,
  subscribeAdminSubscriptionUpdated,
} from "../../../lib/admin-subscription-updated-client";
import StatusBadge from "./components/StatusBadge";
import AdminProofPreviewModal from "./components/AdminProofPreviewModal";
import SubscriptionRejectModal from "./components/SubscriptionRejectModal";
import SubscriptionRemoveModal from "./components/SubscriptionRemoveModal";
import SubscriptionRejectionDetailsModal from "./components/SubscriptionRejectionDetailsModal";
import SubscriptionRequestTimeline from "./components/SubscriptionRequestTimeline";
import { useAdminCommandPaletteShortcut } from "./components/AdminCommandPalette";
import {
  createAdminActionInFlightRegistry,
  runAdminUserActionFlow,
} from "../../../lib/admin-user-action-flow";
import { canRejectSubscriptionRequest } from "../../../lib/admin-subscription-request-reject-shared.js";
import { canRemoveSubscriptionRequest } from "../../../lib/admin-subscription-request-remove-shared.js";
import { isRejectedSubscriptionStatus } from "../../../lib/admin-subscription-rejection-details.js";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";
import {
  ADMIN_SHELL_SECTIONS,
  ADMIN_DEFERRED_SECTIONS,
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
import { fetchPaymentProof } from "../../../lib/admin-financial-center-client.js";

const AppModal = dynamic(() => import("../../components/AppModal"), { ssr: false });

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

const AdminHubOverview = dynamic(() => import("./components/AdminHubOverview"), {
  ssr: false,
  loading: () => (
    <section className="admin-hub-overview space-y-4 animate-pulse">
      <div className="admin-section h-40 rounded-2xl bg-slate-200/40" />
      <div className="admin-hub-tile-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="admin-hub-tile h-36 rounded-2xl bg-slate-200/40" />
        ))}
      </div>
    </section>
  ),
});

const AdminCommandPalette = dynamic(() => import("./components/AdminCommandPalette"), {
  ssr: false,
});

const AdminUserQuickPreviewDrawer = dynamic(
  () => import("./components/AdminUserQuickPreviewDrawer"),
  { ssr: false }
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
  const [highlightedSubscriptionRequestId, setHighlightedSubscriptionRequestId] = useState("");
  const [pendingDrawerUserId, setPendingDrawerUserId] = useState("");
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activityFeedEvents, setActivityFeedEvents] = useState([]);
  const [activityFeedPartialFailure, setActivityFeedPartialFailure] = useState(false);
  const [activityFeedAllSourcesFailed, setActivityFeedAllSourcesFailed] = useState(false);
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
    "activity-feed": createAdminSectionState(),
    analysis: createAdminSectionState(),
    accounts: createAdminSectionState(),
    subscriptions: createAdminSectionState(),
  });
  const sectionFetchRef = useRef(new Set());
  const abortControllersRef = useRef(new Map());
  const adminInitStartedRef = useRef(false);
  const activityFeedInitRef = useRef(false);
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
  const [proofPreviewUrl, setProofPreviewUrl] = useState(null);
  const [subscriptionProofPreview, setSubscriptionProofPreview] = useState(null);
  const subscriptionProofAbortRef = useRef(null);
  const subscriptionProofInFlightRef = useRef(null);
  const subscriptionProofRevokeRef = useRef(null);
  const closeProofPreview = useCallback(() => {
    subscriptionProofAbortRef.current?.abort();
    subscriptionProofAbortRef.current = null;
    subscriptionProofInFlightRef.current = null;
    subscriptionProofRevokeRef.current?.();
    subscriptionProofRevokeRef.current = null;
    setProofPreviewUrl(null);
    setSubscriptionProofPreview(null);
  }, []);

  const openSubscriptionProofPreview = useCallback(
    (requestId) => {
      const normalizedId = String(requestId || "").trim();
      if (!normalizedId) return;

      if (subscriptionProofInFlightRef.current === normalizedId) {
        return;
      }

      if (
        subscriptionProofPreview?.requestId === normalizedId &&
        subscriptionProofPreview?.loading
      ) {
        return;
      }

      if (
        subscriptionProofPreview?.requestId === normalizedId &&
        subscriptionProofPreview?.imageUrl
      ) {
        return;
      }

      subscriptionProofAbortRef.current?.abort();
      const controller = new AbortController();
      subscriptionProofAbortRef.current = controller;
      subscriptionProofInFlightRef.current = normalizedId;

      setProofPreviewUrl(null);
      setSubscriptionProofPreview({
        requestId: normalizedId,
        imageUrl: null,
        loading: true,
        error: "",
      });

      fetchPaymentProof(adminFetch, normalizedId, { signal: controller.signal })
        .then((proof) => {
          if (controller.signal.aborted) return;

          const url = String(proof?.imageUrl || proof?.proof || "").trim();
          if (!isValidPreviewUrl(url)) {
            throw new Error("إثبات الدفع غير متوفر لهذا الطلب");
          }

          subscriptionProofRevokeRef.current?.();
          subscriptionProofRevokeRef.current = typeof proof?.revoke === "function" ? proof.revoke : null;

          setSubscriptionProofPreview({
            requestId: normalizedId,
            imageUrl: url,
            loading: false,
            error: "",
          });
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;

          setSubscriptionProofPreview({
            requestId: normalizedId,
            imageUrl: null,
            loading: false,
            error: error?.message || "تعذر تحميل إثبات الدفع",
          });
        })
        .finally(() => {
          if (subscriptionProofInFlightRef.current === normalizedId) {
            subscriptionProofInFlightRef.current = null;
          }
        });
    },
    [subscriptionProofPreview?.imageUrl, subscriptionProofPreview?.loading, subscriptionProofPreview?.requestId]
  );

  useEffect(() => {
    return () => {
      subscriptionProofAbortRef.current?.abort();
      subscriptionProofAbortRef.current = null;
      subscriptionProofInFlightRef.current = null;
    };
  }, []);
  const [subscriptionRejectTarget, setSubscriptionRejectTarget] = useState(null);
  const [subscriptionRejectLoading, setSubscriptionRejectLoading] = useState(false);
  const [subscriptionRejectApiError, setSubscriptionRejectApiError] = useState("");
  const [subscriptionRemoveTarget, setSubscriptionRemoveTarget] = useState(null);
  const [subscriptionRemoveLoading, setSubscriptionRemoveLoading] = useState(false);
  const [subscriptionRemoveApiError, setSubscriptionRemoveApiError] = useState("");
  const [subscriptionRejectionDetailsTarget, setSubscriptionRejectionDetailsTarget] = useState(null);
  const subscriptionActionInFlightRef = useRef(createAdminActionInFlightRegistry());
  const subscriptionEndedNotifySessionRef = useRef(new Set());

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
      closeProofPreview();
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

    if (section === "activity-feed") {
      setActivityFeedEvents(result.events || []);
      setActivityFeedPartialFailure(Boolean(result.partialFailure));
      setActivityFeedAllSourcesFailed(Boolean(result.allSourcesFailed));
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
      ADMIN_DEFERRED_SECTIONS.forEach((section) => invalidateAdminSectionCache(section));

      await Promise.allSettled(
        ADMIN_SHELL_SECTIONS.map((section) => loadSection(section, { force: true }))
      );

      await Promise.allSettled(
        ADMIN_DEFERRED_SECTIONS.map((section) => loadSection(section, { force: true }))
      );

      if (!silent) {
        setIsRefreshing(false);
      }
    },
    [loadSection]
  );

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((current) => !current);
  }, []);

  const handleCommandExecute = useCallback(
    (item) => {
      setCommandPaletteOpen(false);
      if (!item) return;

      if (item.userId) {
        setPendingDrawerUserId(String(item.userId));
        setPreviewDrawerOpen(true);
        return;
      }

      if (item.action === "refresh-dashboard") {
        void refreshGlobalSections();
        return;
      }

      if (item.href) {
        router.push(item.href);
        return;
      }

      if (item.tab) {
        if (item.tab === "user-management") {
          router.push("/admin/users");
          return;
        }
        setActiveAdminTab(item.tab);
      }
    },
    [refreshGlobalSections, router]
  );

  useAdminCommandPaletteShortcut(toggleCommandPalette);

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
        Notification.requestPermission()
          .then((permission) => {
            if (cancelled) return;
            if (permission === "granted") {
              setBrowserNotificationsEnabled(true);
            }
          })
          .catch(() => {});
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

    if (!sectionStates.stats.loaded || !sectionStates.overview.loaded) {
      return undefined;
    }

    if (activityFeedInitRef.current) {
      return undefined;
    }

    activityFeedInitRef.current = true;

    const cached = getCachedAdminSection("activity-feed");
    void loadSection("activity-feed", {
      background: Boolean(cached) && !isAdminSectionCacheFresh("activity-feed"),
    });
  }, [
    authResolved,
    profileReady,
    user?.email,
    isAdmin,
    loadSection,
    sectionStates.stats.loaded,
    sectionStates.overview.loaded,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("section") || params.get("tab");
    const userId = params.get("userId");
    const requestId = params.get("requestId");
    if (tab) setActiveAdminTab(tab);
    if (userId) {
      setPendingDrawerUserId(userId);
      setPreviewDrawerOpen(true);
    }
    if (requestId) {
      setHighlightedSubscriptionRequestId(String(requestId));
      setActiveAdminTab("subscriptions");
      setSubscriptionFilter("all");
    }
  }, []);

  useEffect(() => {
    const onOpenUser = (event) => {
      const userId = event.detail?.userId;
      if (!userId) return;
      setPendingDrawerUserId(userId);
      setPreviewDrawerOpen(true);
    };

    window.addEventListener("admin:open-user", onOpenUser);
    return () => window.removeEventListener("admin:open-user", onOpenUser);
  }, []);

  useEffect(() => {
    return subscribeAdminSubscriptionUpdated((event) => {
      if (event.detail?.source === "subscriptions") return;
      void loadSection("subscriptions", { force: true, background: true });
      void loadSection("stats", { force: true, background: true });
    });
  }, [loadSection]);

  useEffect(() => {
    if (!highlightedSubscriptionRequestId || activeAdminTab !== "subscriptions") return undefined;
    const frameId = requestAnimationFrame(() => {
      const element = document.querySelector(
        `[data-subscription-request-id="${CSS.escape(highlightedSubscriptionRequestId)}"]`
      );
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("is-highlighted");
      window.setTimeout(() => element.classList.remove("is-highlighted"), 3200);
    });
    return () => cancelAnimationFrame(frameId);
  }, [highlightedSubscriptionRequestId, activeAdminTab, subscriptionRequests.length]);

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
    const pendingSubscriptions = subscriptionRequests.filter((item) =>
      isNewPendingSubscriptionRequest(item.status)
    );

    const pendingAccounts = accountRequests.filter(
      (item) => getAdminStatusKey(item.status) === "pending"
    );

    const notifications = [
      ...pendingSubscriptions.map((item) => ({
        id: buildSubscriptionRequestCreatedNotificationId(item.id),
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
    if (newStatus === "مرفوض") {
      setSubscriptionRejectTarget(request);
      return;
    }

    if (newStatus === "remove") {
      setSubscriptionRemoveTarget(request);
      return;
    }

    if (newStatus === "مفعل") {
      const confirmed = await confirmAdminAction("هل تريد تفعيل هذا الاشتراك للمستخدم؟");
      if (!confirmed) return;
    }

    const actionKey = `subscription:${request.id}:${newStatus}`;

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: subscriptionActionInFlightRef.current,
      execute: async () => {
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

        return result;
      },
      refresh: async () => {
        await loadSection("subscriptions", { force: true, background: true });
      },
      successMessage: newStatus === "مفعل" ? "تم تفعيل الاشتراك" : "تم تحديث حالة طلب الاشتراك",
      errorMessage: "تعذر تحديث حالة طلب الاشتراك",
      onSuccess: (apiResult) => {
        setSubscriptionRequests((prev) =>
          prev.map((item) =>
            item.id === request.id ? { ...item, status: newStatus } : item
          )
        );

        dispatchAdminSubscriptionUpdatedEvent({
          requestId: request.id,
          userEmail: request.userEmail,
          previousStatus: request.status,
          newStatus,
          source: "subscriptions",
        });

        if (newStatus === "مفعل" && apiResult?.profileUpdated !== false) {
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
      },
    });

    if (flowResult.blocked) return;

    if (flowResult.success) {
      const apiResult = flowResult.data || {};
      let message = flowResult.refreshFailed
        ? `${flowResult.successMessage} — تعذr تحديث القائمة تلقائياً.`
        : flowResult.successMessage;

      if (newStatus === "مفعل") {
        const warnings = Array.isArray(apiResult.warnings)
          ? apiResult.warnings.filter(Boolean)
          : [
              apiResult.notificationWarning,
              apiResult.emailWarning,
              apiResult.auditWarning,
            ].filter(Boolean);

        if (warnings.length) {
          message = `${message} — ${warnings.join(" — ")}`;
        }
      }

      showAdminNotice(message);
      return;
    }

    showAdminNotice(flowResult.errorMessage || "تعذر تحديث حالة طلب الاشتراك", "error");
  };

  const confirmSubscriptionRejection = async ({ reasonLabel, notes }) => {
    const request = subscriptionRejectTarget;
    if (!request) return;

    const actionKey = `subscription:${request.id}:reject`;
    const rejectController = new AbortController();
    const rejectTimeoutId = setTimeout(() => rejectController.abort(), 20000);

    setSubscriptionRejectLoading(true);
    setSubscriptionRejectApiError("");

    const subscriptionRequestId = String(request?.id ?? "").trim();
    const rejectUrl = `/api/admin/subscription-requests/${encodeURIComponent(subscriptionRequestId)}/reject`;

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: subscriptionActionInFlightRef.current,
      execute: async () => {
        const response = await adminFetch(rejectUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              rejectionReason: reasonLabel,
              rejectionNotes: notes,
            }),
            signal: rejectController.signal,
          }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result?.success) {
          const error = new Error(result?.error || "تعذر رفض طلب الاشتراك");
          error.code = result?.errorCode || null;
          throw error;
        }

        return result;
      },
      refresh: async () => {
        await loadSection("subscriptions", { force: true, background: true });
      },
      successMessage: "تم رفض طلب الاشتراك",
      errorMessage: "تعذر رفض طلب الاشتراك",
      onSuccess: (apiResult) => {
        setSubscriptionRequests((prev) =>
          prev.map((item) => {
            if (item.id !== request.id) return item;

            const details = apiResult?.rejectionDetails;
            return {
              ...item,
              status: "مرفوض",
              rejectionDetails: details
                ? {
                    rejectionReason: details.rejectionReason || "",
                    adminNotes: details.adminNotes || "",
                    rejectedAt: details.rejectedAt
                      ? new Date(details.rejectedAt).toLocaleString("ar")
                      : "",
                    rejectedByEmail: details.rejectedByEmail || "",
                    notificationCreated: Boolean(details.notificationCreated),
                    emailQueued: Boolean(details.emailQueued),
                  }
                : item.rejectionDetails,
            };
          })
        );
        setSubscriptionRejectTarget(null);
        setSubscriptionRejectApiError("");
        dispatchAdminSubscriptionUpdatedEvent({
          requestId: request.id,
          userEmail: request.userEmail,
          previousStatus: request.status,
          newStatus: "مرفوض",
          source: "subscriptions",
        });
      },
    });

    clearTimeout(rejectTimeoutId);
    setSubscriptionRejectLoading(false);

    if (flowResult.blocked) return;

    if (flowResult.success) {
      const apiResult = flowResult.data || {};
      let message = flowResult.refreshFailed
        ? "تم رفض طلب الاشتراك — تعذر تحديث القائمة تلقائياً."
        : flowResult.successMessage;

      const warnings = Array.isArray(apiResult.warnings)
        ? apiResult.warnings.filter(Boolean)
        : [apiResult.notificationWarning, apiResult.emailWarning, apiResult.auditWarning].filter(Boolean);

      if (warnings.length) {
        message = `${message} — ${warnings.join(" — ")}`;
      }

      showAdminNotice(message);
      return;
    }

    const rejectErrorMessage =
      flowResult.error?.name === "AbortError"
        ? "تعذر رفض طلب الاشتراك خلال الوقت المحدد"
        : flowResult.error?.message || flowResult.errorMessage || "تعذر رفض طلب الاشتراك";

    setSubscriptionRejectApiError(rejectErrorMessage);
  };

  const confirmSubscriptionRemoval = async ({ notes }) => {
    const request = subscriptionRemoveTarget;
    if (!request) return;

    const actionKey = `subscription:${request.id}:remove`;
    const removeController = new AbortController();
    const removeTimeoutId = setTimeout(() => removeController.abort(), 20000);

    setSubscriptionRemoveLoading(true);
    setSubscriptionRemoveApiError("");

    const subscriptionRequestId = String(request?.id ?? "").trim();
    const removeUrl = `/api/admin/subscription-requests/${encodeURIComponent(subscriptionRequestId)}/remove`;

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: subscriptionActionInFlightRef.current,
      execute: async () => {
        const response = await adminFetch(removeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            removalNotes: notes,
          }),
          signal: removeController.signal,
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result?.success) {
          const error = new Error(result?.error || "تعذر إزالة الاشتراك");
          error.code = result?.errorCode || null;
          throw error;
        }

        return result;
      },
      refresh: async () => {
        await loadSection("subscriptions", { force: true, background: true });
      },
      successMessage: "تم إزالة الاشتراك",
      errorMessage: "تعذر إزالة الاشتراك",
      onSuccess: () => {
        setSubscriptionRequests((prev) =>
          prev.map((item) =>
            item.id === request.id
              ? { ...item, status: "منتهي", admin_disabled: true }
              : item
          )
        );

        dispatchAdminSubscriptionRemovedEvent({
          requestId: request.id,
          userEmail: request.userEmail,
          userId: request.userId,
          planName: request.planName,
          status: "منتهي",
        });

        const endedNotifyDecision = resolveAdminSubscriptionEndedNotifyDecision(request.id, {
          isAcknowledged: isAdminDashboardNotificationAcknowledged,
          isRendered: isNotificationCenterRendered,
          sessionSentIds: subscriptionEndedNotifySessionRef.current,
        });

        if (endedNotifyDecision.shouldNotify) {
          markAdminSubscriptionEndedNotificationSent(
            request.id,
            subscriptionEndedNotifySessionRef.current
          );

          void notify({
            key: "subscription_ended",
            title: "تم إنهاء اشتراك المستخدم",
            body: `${request.planName || "اشتراك"} — ${request.userEmail || request.username || "مستخدم"}`,
            url: "/admin",
            persist: false,
            skipBrowser: !browserNotificationsEnabled,
            metadata: { id: endedNotifyDecision.id },
            source: "admin-dashboard",
          }).finally(() => {
            acknowledgeAdminDashboardNotifications([endedNotifyDecision.id]);
          });
        }

        if (request.userEmail) {
          setUsers((prev) =>
            prev.map((user) =>
              user.email === request.userEmail
                ? {
                    ...user,
                    subscription_status: "غير نشط",
                  }
                : user
            )
          );
        }

        setSubscriptionRemoveTarget(null);
        setSubscriptionRemoveApiError("");
      },
    });

    clearTimeout(removeTimeoutId);
    setSubscriptionRemoveLoading(false);

    if (flowResult.blocked) return;

    if (flowResult.success) {
      const apiResult = flowResult.data || {};
      let message = flowResult.refreshFailed
        ? "تم إزالة الاشتراك — تعذر تحديث القائمة تلقائياً."
        : flowResult.successMessage;

      const warnings = Array.isArray(apiResult.warnings)
        ? apiResult.warnings.filter(Boolean)
        : [apiResult.notificationWarning, apiResult.emailWarning, apiResult.auditWarning].filter(
            Boolean
          );

      if (warnings.length) {
        message = `${message} — ${warnings.join(" — ")}`;
      }

      showAdminNotice(message);
      return;
    }

    const removeErrorMessage =
      flowResult.error?.name === "AbortError"
        ? "تعذر إزالة الاشتراك خلال الوقت المحدد"
        : flowResult.error?.message || flowResult.errorMessage || "تعذر إزالة الاشتراك";

    setSubscriptionRemoveApiError(removeErrorMessage);
  };

  const stats = useMemo(() => {
    if (apiStats) {
      return {
        pendingAnalysis: apiStats.analysisPending ?? 0,
        completedAnalysis: apiStats.analysisReviewed ?? 0,
        pendingAccounts: apiStats.accountsPending ?? 0,
        pendingSubscriptions: apiStats.subscriptionsPending ?? 0,
        pendingPaymentReviews: apiStats.pendingPaymentReviews ?? 0,
        usersCount: apiStats.usersCount ?? 0,
        analysisTotal: apiStats.analysisTotal ?? analysisRequests.length,
        accountsTotal: apiStats.accountsTotal ?? accountRequests.length,
        subscriptionsTotal: apiStats.subscriptionsTotal ?? subscriptionRequests.length,
        withdrawalsPending: apiStats.withdrawalsPending ?? 0,
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
      pendingPaymentReviews: 0,
      withdrawalsPending: 0,
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
        .filter((item) => isNewPendingSubscriptionRequest(item.status))
        .slice(0, 3)
        .map((item) => ({
          id: buildSubscriptionRequestCreatedNotificationId(item.id),
          tab: "subscriptions",
          icon: "💳",
          title: item.planName || "طلب اشتراك",
          message: `${item.userEmail || item.username || "مستخدم"} · ${item.price || "—"}`,
          createdAt: item.createdAt,
        })),
    ];

    return items.slice(0, 6);
  }, [adminFeedNotifications, analysisRequests, accountRequests, subscriptionRequests]);

  const urgentItems = useMemo(() => {
    return recentOverviewItems.map((item) => {
      let kindLabel = "متابعة";
      if (item.tab === "subscriptions" || item.type === "subscription") kindLabel = "اشتراك";
      if (item.tab === "accounts" || item.type === "account") kindLabel = "حساب";
      if (item.tab === "analysis" || item.type === "analysis") kindLabel = "تحليل";
      if (item.type === "withdrawal") kindLabel = "سحب";
      if (item.type === "email") kindLabel = "بريد";
      return { ...item, kindLabel };
    });
  }, [recentOverviewItems]);

  const handleOpenUrgentItem = useCallback(
    (item) => {
      if (item.tab) {
        setActiveAdminTab(item.tab);
        if (item.tab === "analysis") setFilter("pending");
        if (item.tab === "accounts") setAccountFilter("pending");
        if (item.tab === "subscriptions") setSubscriptionFilter("pending");
        return;
      }
      if (item.type === "withdrawal") {
        window.location.href = item.url || "/admin/partners";
      }
    },
    []
  );

  const handleActivityFeedRefresh = useCallback(() => {
    invalidateAdminSectionCache("activity-feed");
    void loadSection("activity-feed", { force: true, background: true });
  }, [loadSection]);

  const handleActivityEventOpen = useCallback((event) => {
    if (event.href) {
      router.push(event.href);
      return;
    }

    if (event.tab) {
      setActiveAdminTab(event.tab);
    }

    if (event.targetUserId) {
      setPendingDrawerUserId(event.targetUserId);
      setPreviewDrawerOpen(true);
    }
  }, [router]);

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
  const activityFeedPending =
    !sectionStates["activity-feed"].loaded && !sectionStates["activity-feed"].error;
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
    <main
      className={`admin-theme-page admin-hub-shell relative overflow-x-hidden ${
        activeAdminTab === "overview" ? "admin-hub-shell--overview" : "admin-hub-shell--workspace"
      }`}
    >
      <AppModal
        open={adminNotice.open}
        type={adminNotice.type === "error" ? "error" : "success"}
        title={adminNotice.title}
        message={adminNotice.message}
        onClose={() => setAdminNotice((current) => ({ ...current, open: false }))}
      />

      <AdminProofPreviewModal
        open={Boolean(proofPreviewUrl || subscriptionProofPreview)}
        imageUrl={
          proofPreviewUrl ||
          (subscriptionProofPreview?.imageUrl && isValidPreviewUrl(subscriptionProofPreview.imageUrl)
            ? subscriptionProofPreview.imageUrl
            : null)
        }
        loading={Boolean(subscriptionProofPreview?.loading)}
        error={subscriptionProofPreview?.error || ""}
        onRetry={
          subscriptionProofPreview?.requestId
            ? () => openSubscriptionProofPreview(subscriptionProofPreview.requestId)
            : null
        }
        onClose={closeProofPreview}
      />

      <SubscriptionRejectModal
        request={subscriptionRejectTarget}
        loading={subscriptionRejectLoading}
        apiError={subscriptionRejectApiError}
        onCancel={() => {
          if (!subscriptionRejectLoading) {
            setSubscriptionRejectTarget(null);
            setSubscriptionRejectApiError("");
          }
        }}
        onConfirm={confirmSubscriptionRejection}
      />

      <SubscriptionRemoveModal
        request={subscriptionRemoveTarget}
        loading={subscriptionRemoveLoading}
        apiError={subscriptionRemoveApiError}
        onCancel={() => {
          if (!subscriptionRemoveLoading) {
            setSubscriptionRemoveTarget(null);
            setSubscriptionRemoveApiError("");
          }
        }}
        onConfirm={confirmSubscriptionRemoval}
      />

      <SubscriptionRejectionDetailsModal
        request={subscriptionRejectionDetailsTarget}
        onClose={() => setSubscriptionRejectionDetailsTarget(null)}
      />

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

      <div className="relative z-20 space-y-4 p-4 md:p-6">
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

        <section className="admin-hub-tabs admin-section">
          <div className="admin-hub-tabs__list" role="tablist" aria-label="أقسام لوحة الإدارة">
            {ADMIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeAdminTab === tab.id}
                onClick={() => setActiveAdminTab(tab.id)}
                className={`admin-hub-tabs__btn ${activeAdminTab === tab.id ? "is-active" : ""}`}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeAdminTab === "overview" ? (
          <AdminHubOverview
            user={user}
            stats={stats}
            statsPending={statsPending}
            statsError={sectionStates.stats.error}
            onRetryStats={() => void loadSection("stats", { force: true })}
            lastUpdatedAt={lastUpdatedAt}
            isRefreshing={isRefreshing}
            adminUnreadCount={adminUnreadCount}
            onRefresh={() => void refreshGlobalSections()}
            onOpenCommandPalette={toggleCommandPalette}
            onToggleNotifications={handleAdminNotificationsBellClick}
            onLogout={logoutAdmin}
            notificationsWrapperRef={adminNotificationsRef}
            notificationsButtonRef={adminNotificationsBellRef}
            onNavigateTab={setActiveAdminTab}
            urgentItems={urgentItems}
            urgentLoading={overviewPending}
            onOpenUrgentItem={handleOpenUrgentItem}
            activityEvents={activityFeedEvents}
            activityLoading={activityFeedPending}
            activityError={sectionStates["activity-feed"].error}
            activityPartialFailure={activityFeedPartialFailure}
            activityAllSourcesFailed={activityFeedAllSourcesFailed}
            activityRefreshing={sectionStates["activity-feed"].refreshing}
            onActivityRefresh={handleActivityFeedRefresh}
            onOpenActivityEvent={handleActivityEventOpen}
          />
        ) : null}

        {activeAdminTab !== "overview" ? (
          <section className="admin-hub-subtoolbar admin-section">
            <button
              type="button"
              className="admin-standalone-back-link"
              onClick={() => setActiveAdminTab("overview")}
            >
              ← العودة للرئيسية
            </button>
            <div className="admin-hub-subtoolbar__actions">
              <button
                type="button"
                className="admin-btn-surface px-4 py-2"
                onClick={toggleCommandPalette}
              >
                ⌘K
              </button>
              <div className="relative" ref={activeAdminTab !== "overview" ? adminNotificationsRef : undefined}>
                <button
                  type="button"
                  ref={activeAdminTab !== "overview" ? adminNotificationsBellRef : undefined}
                  className="admin-btn-surface px-4 py-2"
                  onClick={handleAdminNotificationsBellClick}
                >
                  🔔
                  {adminUnreadCount > 0 ? ` (${adminUnreadCount})` : ""}
                </button>
              </div>
              <button type="button" className="admin-btn-surface px-4 py-2" onClick={logoutAdmin}>
                خروج
              </button>
            </div>
          </section>
        ) : null}

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
                            onClick={() => setProofPreviewUrl(req.replyImage)}
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
                          onClick={() => setProofPreviewUrl(replies[req.id].image)}
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
                <article
                  key={req.id}
                  data-subscription-request-id={String(req.id)}
                  className={`admin-section admin-card p-6 ${
                    highlightedSubscriptionRequestId === String(req.id) ? "is-highlighted" : ""
                  }`}
                >
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
                      {canRejectSubscriptionRequest(req.status) ? (
                        <button
                          type="button"
                          onClick={() => updateSubscriptionRequest(req, "مرفوض")}
                          className="admin-btn--reject rounded-2xl px-5 py-3 font-black transition hover:scale-[1.01] hover:brightness-110"
                        >
                          ❌ رفض الاشتراك
                        </button>
                      ) : null}
                      {canRemoveSubscriptionRequest(req.status) ? (
                        <button
                          type="button"
                          onClick={() => updateSubscriptionRequest(req, "remove")}
                          className="admin-btn--remove rounded-2xl px-5 py-3 font-black transition hover:scale-[1.01] hover:brightness-110"
                        >
                          🔴 إزالة الاشتراك
                        </button>
                      ) : null}
                      {isRejectedSubscriptionStatus(req.status) ? (
                        <button
                          type="button"
                          onClick={() => setSubscriptionRejectionDetailsTarget(req)}
                          className="admin-btn--view-rejection rounded-2xl px-5 py-3 font-black transition hover:scale-[1.01] hover:brightness-110"
                        >
                          عرض سبب الرفض
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {(req.telegramUsername || req.hasPaymentProof) && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {req.telegramUsername && (
                        <div className="admin-inline-panel">
                          <p className="text-xs font-bold text-slate-800">يوزر التليجرام</p>
                          <p className="mt-2 break-all font-bold">{req.telegramUsername}</p>
                        </div>
                      )}

                      {req.hasPaymentProof ? (
                        <div className="admin-inline-panel">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-800">إثبات الدفع</p>
                              <p className="mt-2 font-bold">صورة إشعار الدفع مرفقة</p>
                              <p className="mt-1 text-xs font-bold text-slate-800">
                                اضغط زر فتح الصورة لعرض إثبات الدفع بدقة كاملة.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openSubscriptionProofPreview(req.id)}
                              className="shrink-0 rounded-xl bg-gradient-to-l from-blue-700 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:brightness-110"
                            >
                              فتح الصورة
                            </button>
                          </div>
                          <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-cyan-100 bg-slate-50 p-6 text-center">
                            <p className="text-sm font-bold text-slate-600">
                              لم يتم تحميل الصورة بعد. سيتم جلبها عند فتح المعاينة.
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="admin-heading text-lg">سجل الطلب</h4>
                    </div>
                    <SubscriptionRequestTimeline
                      timeline={req.timeline}
                      summary={req.timelineSummary}
                      sparse={req.timelineSparse}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        ))}
      </div>

      <AdminCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={handleCommandExecute}
      />

      <AdminUserQuickPreviewDrawer
        open={previewDrawerOpen}
        userId={pendingDrawerUserId}
        onClose={() => {
          setPreviewDrawerOpen(false);
          setPendingDrawerUserId("");
        }}
      />
    </main>
  );
}
