"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../lib/admin-fetch";
import { notify } from "../../lib/notification-center";
import { supabase } from "../../lib/supabase";
import AppModal from "../components/AppModal";
import { useAuth } from "../components/AuthProvider";

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

function AdminStat({ title, value, icon, subtitle, tone = "blue" }) {
  const glow =
    tone === "green"
      ? "from-emerald-400/20 to-cyan-400/10"
      : tone === "orange"
      ? "from-amber-400/20 to-orange-400/10"
      : tone === "red"
      ? "from-red-400/20 to-orange-400/10"
      : "from-blue-500/20 to-cyan-400/10";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
      <div className={`absolute inset-0 bg-gradient-to-br ${glow}`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-300">{title}</p>
          <h3 className="mt-3 text-4xl font-black text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]">{value}</h3>
          <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {icon}
        </div>
      </div>
    </div>
  );
}


function StatusBadge({ status }) {
  const isReviewed = getAdminStatusKey(status) === "reviewed";

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${
        isReviewed
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {getAdminStatusLabel(status)}
    </span>
  );
}

const ADMIN_STATUS_FILTERS = [
  ["pending", "بانتظار المراجعة"],
  ["reviewed", "تمت المراجعة"],
  ["all", "الكل"],
];

const ADMIN_TABS = [
  { id: "overview", label: "نظرة عامة", icon: "📊" },
  { id: "analysis", label: "طلبات التحليل", icon: "🧠" },
  { id: "daily-publish", label: "نشر تحليل يومي", icon: "📝" },
  { id: "accounts", label: "إدارة الحسابات", icon: "📂" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "vip", label: "نشر VIP", icon: "⭐" },
];

const SIMPLE_STATUS_OPTIONS = [
  { value: "pending", label: "بانتظار المراجعة" },
  { value: "reviewed", label: "تمت المراجعة" },
];

const PENDING_STATUS_VALUES = new Set([
  "pending",
  "new",
  "reviewing",
  "قيد المراجعة",
  "بانتظار المراجعة",
  "جديد",
  "قيد المعالجة",
  "قيد التحليل",
]);

const REVIEWED_STATUS_VALUES = new Set([
  "reviewed",
  "approved",
  "completed",
  "تمت المراجعة",
  "تم الرد",
  "مكتمل",
  "مفعل",
  "تم التواصل",
  "قيد التفعيل",
  "نشط",
  "مرفوض",
  "مؤرشف",
  "مغلق",
  "بانتظار الدفع",
]);

const normalizeAdminStatusValue = (status) => String(status || "").trim().toLowerCase();

const getAdminStatusKey = (status) => {
  const raw = String(status || "").trim();
  const normalized = normalizeAdminStatusValue(status);

  if (
    !raw ||
    PENDING_STATUS_VALUES.has(raw) ||
    PENDING_STATUS_VALUES.has(normalized)
  ) {
    return "pending";
  }

  if (REVIEWED_STATUS_VALUES.has(raw) || REVIEWED_STATUS_VALUES.has(normalized)) {
    return "reviewed";
  }

  return "pending";
};

const getAdminStatusLabel = (status) => {
  if (status === "reviewed") return "تمت المراجعة";
  if (status === "pending") return "بانتظار المراجعة";
  return getAdminStatusKey(status) === "reviewed" ? "تمت المراجعة" : "بانتظار المراجعة";
};

const matchesAdminStatusFilter = (status, filterKey) => {
  if (filterKey === "all") return true;
  return getAdminStatusKey(status) === filterKey;
};

const countAdminStatusFilter = (list, filterKey, getStatus = (item) => item.status) =>
  list.filter((item) => matchesAdminStatusFilter(getStatus(item), filterKey)).length;

const getSimpleStatusSelectValue = (status) => getAdminStatusKey(status);

const ADMIN_ANALYSIS_LIMIT = 50;
const ADMIN_USERS_LIMIT = 200;
const ADMIN_SUBSCRIPTIONS_LIMIT = 50;

// --- Admin search helpers ---
const normalizeAdminSearch = (value) => String(value || "").trim().toLowerCase();

const isValidPreviewUrl = (value) => {
  const src = String(value || "").trim();
  if (!src || src === "null" || src === "undefined" || src.startsWith("about:")) {
    return false;
  }
  return true;
};

const matchesAdminSearch = (item, searchValue, fields) => {
  const query = normalizeAdminSearch(searchValue);
  if (!query) return true;

  return fields.some((field) =>
    normalizeAdminSearch(item?.[field]).includes(query)
  );
};

const formatAnalysisRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  coin: item.coin,
  frame: item.frame,
  status: item.status || "قيد المراجعة",
  reply: item.reply || "",
  replyImage: item.reply_image || "",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
});


const formatSubscriptionRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  planName: item.plan_name,
  category: item.category,
  price: item.price,
  telegramUsername: item.telegram_username || "",
  paymentProof: item.payment_proof || "",
  status: item.status || "قيد المعالجة",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
});

const formatAccountManagementRequest = (item) => ({
  id: item.id,
  type: item.account_type || item.platform || "طلب إدارة حساب",
  platform: item.platform || "",
  email: item.email || "",
  telegram: item.contact_method || "",
  capital: item.capital || "",
  notes: item.notes || "",
  status: item.status || "جديد",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
  apiKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  secretKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  password: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  hasSensitiveKeys: Boolean(item.has_sensitive_keys),
});

const upsertById = (list, item, limit) => {
  const filtered = list.filter((current) => current.id !== item.id);
  return [item, ...filtered].slice(0, limit);
};

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
  const [lastNotificationIds, setLastNotificationIds] = useState([]);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const adminNotificationsRef = useRef(null);
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
  const [hasLoadedAdminData, setHasLoadedAdminData] = useState(false);
  const hasLoadedAdminDataRef = useRef(false);
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
      if (
        adminNotificationsRef.current &&
        !adminNotificationsRef.current.contains(event.target)
      ) {
        setAdminNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [adminNotificationsOpen]);

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


  useEffect(() => {
    if (!authResolved || !profileReady || !user?.email || !isAdmin) {
      return undefined;
    }

    let cancelled = false;

    const initAdmin = async () => {
      try {
        const response = await adminFetch("/api/admin/dashboard", {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.status === 401 || response.status === 403) {
          throw new Error(result?.error || "تعذر التحقق من صلاحية الإدارة");
        }

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "فشل التحقق من صلاحية الإدارة");
        }

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

        await loadAdminData({ silent: false, initialResult: result });
      } catch (error) {
        if (cancelled) return;

        showAdminNotice(
          error?.message || "تعذر تحميل بيانات لوحة الإدارة",
          "error",
          "تعذر التحميل"
        );
      }
    };

    initAdmin();

    const backupInterval = setInterval(() => {
      loadAdminData({ silent: true });
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(backupInterval);
    };
  }, [authResolved, profileReady, user?.email, isAdmin]);

  const applyAdminDashboardResult = (result) => {
    const formattedAnalysis = (result.analysis_requests || []).map(formatAnalysisRequest);
    const formattedSubscriptions = (result.subscription_requests || []).map(
      formatSubscriptionRequest
    );
    const formattedAccounts = (result.account_management_requests || []).map(
      formatAccountManagementRequest
    );

    setUsers(result.profiles || []);
    setAnalysisRequests(formattedAnalysis);
    setSubscriptionRequests(formattedSubscriptions);
    setAccountRequests(formattedAccounts);
    setDataMode("secure-api");
    setLastUpdatedAt(new Date().toLocaleTimeString("ar"));
    hasLoadedAdminDataRef.current = true;
    setHasLoadedAdminData(true);
    setRefreshWarning("");
  };

  const loadAdminData = async (options = {}) => {
    if (!options.silent) {
      setIsRefreshing(true);
    }

    try {
      if (options.initialResult?.success) {
        applyAdminDashboardResult(options.initialResult);
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await adminFetch("/api/admin/dashboard", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        throw new Error(result?.error || "تعذر تحميل بيانات لوحة الإدارة");
      }

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "فشل تحميل بيانات لوحة الإدارة");
      }

      applyAdminDashboardResult(result);
    } catch (err) {
      console.error("Admin load error:", err);

      if (options.silent || hasLoadedAdminDataRef.current) {
        setRefreshWarning("بعض البيانات تأخرت في التحديث");
        return;
      }

      setUsers([]);
      setAnalysisRequests([]);
      setSubscriptionRequests([]);
      setAccountRequests([]);
      setDataMode("secure-api");
      setLastUpdatedAt(new Date().toLocaleTimeString("ar"));

      showAdminNotice(
        err?.name === "AbortError"
          ? "انتهت مهلة تحميل لوحة الإدارة. جرّب تحديث الصفحة."
          : err?.message || "فشل تحميل بيانات لوحة الإدارة",
        "error"
      );
    } finally {
      setIsRefreshing(false);
    }
  };

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
        title: "طلب اشتراك جديد 💳",
        body: `${item.planName || "اشتراك جديد"} - ${item.userEmail || item.username || "مستخدم"}`,
      })),
      ...pendingAccounts.map((item) => ({
        id: `account-${item.id}`,
        title: "طلب إدارة حساب جديد 📂",
        body: item.email || item.telegram || "طلب جديد",
      })),
    ];

    notifications.forEach((item) => {
      if (lastNotificationIds.includes(item.id)) return;

      void notify({
        key: "admin",
        title: item.title,
        body: item.body,
        url: "/admin",
        persist: false,
        skipBrowser: !browserNotificationsEnabled,
        metadata: { id: item.id },
        source: "admin-dashboard",
      });
    });

    setLastNotificationIds((prev) => [
      ...new Set([...prev, ...notifications.map((item) => item.id)]),
    ]);
  }, [
    browserNotificationsEnabled,
    subscriptionRequests,
    accountRequests,
    lastNotificationIds,
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
    const pendingAnalysis = analysisRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;
    const completedAnalysis = analysisRequests.filter((req) => getAdminStatusKey(req.status) === "reviewed").length;
    const pendingAccounts = accountRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;
    const pendingSubscriptions = subscriptionRequests.filter((req) => getAdminStatusKey(req.status) === "pending").length;

    return { pendingAnalysis, completedAnalysis, pendingAccounts, pendingSubscriptions, usersCount: users.length };
  }, [analysisRequests, accountRequests, subscriptionRequests, users]);

  const adminNotifications = useMemo(() => {
    const subscriptionItems = subscriptionRequests
      .filter((item) => getAdminStatusKey(item.status) === "pending")
      .map((item) => ({
        id: `subscription-${item.id}`,
        type: "subscription",
        icon: "💳",
        title: "طلب اشتراك جديد",
        message: `${item.planName || "اشتراك جديد"} - ${item.userEmail || item.username || "مستخدم"}`,
        createdAt: item.createdAt,
      }));

    const accountItems = accountRequests
      .filter((item) => getAdminStatusKey(item.status) === "pending")
      .map((item) => ({
        id: `account-${item.id}`,
        type: "account",
        icon: "📂",
        title: "طلب إدارة حساب جديد",
        message: item.email || item.telegram || "طلب جديد",
        createdAt: item.createdAt,
      }));

    return [...subscriptionItems, ...accountItems].slice(0, 20);
  }, [subscriptionRequests, accountRequests]);

  const recentOverviewItems = useMemo(() => {
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
  }, [analysisRequests, accountRequests, subscriptionRequests]);

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

  if (!hasLoadedAdminData) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
        <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
          <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 text-4xl">⏳</div>
            <h1 className="text-3xl font-black">جاري تحميل لوحة الإدارة</h1>
            <p className="mt-3 leading-7 text-slate-400">يرجى الانتظار حتى اكتمال تحميل البيانات...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-0 overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
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
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-cyan-200/70 bg-white/95 px-4 py-4 md:px-6">
                <p className="text-lg font-black text-slate-950">معاينة الصورة</p>
                <button
                  type="button"
                  onClick={() => setProofPreview(null)}
                  className="rounded-2xl border border-cyan-200 bg-white px-6 py-3 font-black text-slate-950 shadow-[0_10px_30px_rgba(14,165,233,0.12)] transition hover:bg-cyan-50"
                >
                  إغلاق
                </button>
              </div>
              <div
                className="flex flex-1 items-center justify-center overflow-auto p-4 md:p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={proofPreview}
                  alt="معاينة الصورة"
                  className="max-h-[calc(100vh-88px)] max-w-full rounded-2xl border border-cyan-100 bg-white object-contain shadow-[0_20px_70px_rgba(14,165,233,0.2)]"
                />
              </div>
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

      <div className="relative z-10 space-y-8 p-4 text-slate-100 md:p-6">
        {refreshWarning && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 shadow-[0_10px_30px_rgba(245,158,11,0.12)]">
            <span>{refreshWarning}</span>
            <button
              type="button"
              onClick={() => setRefreshWarning("")}
              className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-800 transition hover:bg-amber-100"
            >
              إغلاق
            </button>
          </div>
        )}

        <section className="relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-7 md:p-9 shadow-2xl backdrop-blur-2xl">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

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
              loadAdminData();
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
                  type="button"
                  onClick={() => setAdminNotificationsOpen((prev) => !prev)}
                  className="relative rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-6 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  🔔 إشعارات الأدمن
                  {adminNotifications.length > 0 && (
                    <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_22px_rgba(239,68,68,0.55)]">
                      {adminNotifications.length}
                    </span>
                  )}
                </button>

                {adminNotificationsOpen && (
                  <div className="absolute right-0 top-full z-[140] mt-3 w-[min(92vw,520px)] overflow-hidden rounded-[28px] border border-cyan-200 bg-white/95 p-4 text-right text-slate-950 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <h3 className="text-lg font-black text-slate-950">مركز إشعارات الأدمن</h3>
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-blacktext-cyan-200">
                        {adminNotifications.length} جديد
                      </span>
                    </div>

                    {adminNotifications.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-3xl">✅</p>
                        <p className="mt-3 font-black text-slate-950">لا توجد طلبات جديدة</p>
                        <p className="mt-1 text-sm text-slate-600">طلبات الاشتراك وإدارة الحسابات الجديدة ستظهر هنا.</p>
                      </div>
                    ) : (
                      <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
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
                            }}
                            className="w-full rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-right transition hover:border-cyan-300 hover:bg-cyan-100"
                          >
                            <div className="flex items-start gap-3">
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-white text-2xl shadow-sm">
                                {item.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-slate-950">{item.title}</p>
                                <p className="mt-1 break-words text-sm font-bold text-slate-700">{item.message}</p>
                                {item.createdAt && <p className="mt-2 text-xs font-bold text-slate-300">{item.createdAt}</p>}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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

        <section className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-5 text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl md:p-6">
          {adminNotifications.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
              يوجد طلبات جديدة تحتاج مراجعة
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
                    <span className="font-black text-slate-950">
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
                  loadAdminData();
                }}
                className="shrink-0 rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-[0_14px_38px_rgba(37,99,235,0.28)] transition hover:brightness-110"
              >
                تحديث الآن
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-100 bg-white/90 px-4 py-3">
                <p className="text-xs font-bold text-slate-600">طلبات التحليل المنتظرة</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{stats.pendingAnalysis}</p>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-white/90 px-4 py-3">
                <p className="text-xs font-bold text-slate-600">إدارة الحسابات المنتظرة</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{stats.pendingAccounts}</p>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-white/90 px-4 py-3">
                <p className="text-xs font-bold text-slate-600">طلبات الاشتراك المنتظرة</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{stats.pendingSubscriptions}</p>
              </div>
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
                      : "border-cyan-200 bg-cyan-50 text-slate-950 hover:bg-cyan-100"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-3 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl md:p-4">
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
          <>
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
          <AdminStat title="طلبات التحليل" value={analysisRequests.length} icon="🧠" subtitle="إجمالي الطلبات" />
          <AdminStat title="بانتظار الرد" value={stats.pendingAnalysis} icon="⏳" subtitle="طلبات تحتاج متابعة" tone="orange" />
          <AdminStat title="تم إنجازها" value={stats.completedAnalysis} icon="✅" subtitle="طلبات مكتملة" tone="green" />
          <AdminStat title="إدارة الحسابات" value={accountRequests.length} icon="📂" subtitle="طلبات العملاء" tone="red" />
          <AdminStat title="المستخدمون" value={stats.usersCount} icon="👥" subtitle={dataMode === "secure-api" ? "من Secure API" : dataMode === "supabase" ? "من Supabase" : "محلياً للتجربة"} tone="green" />
          <AdminStat title="طلبات الاشتراك" value={subscriptionRequests.length} icon="💳" subtitle={`${stats.pendingSubscriptions} بانتظار التفعيل`} tone="orange" />
        </section>

        <Link
          href="/admin/email-analytics"
          className="group relative block overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl transition duration-200 hover:border-cyan-300/30 hover:bg-white/[0.06] hover:shadow-[0_0_40px_rgba(34,211,238,0.12)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 opacity-80 transition group-hover:opacity-100" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-300">Email Analytics</p>
              <h3 className="mt-3 text-2xl font-black text-white">📧 مراقبة الإيميلات</h3>
              <p className="mt-2 text-sm text-slate-300">تتبع التسليم، الفتح، النقر، والأخطاء عبر Resend</p>
            </div>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)] transition group-hover:scale-105">
              📧
            </div>
          </div>
        </Link>

        <section className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-5 text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">آخر الطلبات الجديدة</h2>
              <p className="mt-2 text-sm font-bold text-slate-600">أحدث الطلبات التي تحتاج متابعة سريعة.</p>
            </div>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black text-cyan-800">
              {recentOverviewItems.length} طلب
            </span>
          </div>

          {recentOverviewItems.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/60 p-8 text-center">
              <p className="text-3xl">✅</p>
              <p className="mt-3 font-black text-slate-950">لا توجد طلبات جديدة حالياً</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                  className="rounded-2xl border border-cyan-100 bg-white/90 p-4 text-right transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-xl">
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-950">{item.title}</p>
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
          </>
        )}

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
        <section className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-4 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl md:p-5">
          <div className="flex flex-wrap gap-3">
            {ADMIN_STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                  filter === key
                    ? "border-cyan-200 bg-cyan-50 text-slate-950 shadow-[0_0_25px_rgba(14,165,233,0.12)]"
                    : "border-cyan-100 bg-white/80 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50"
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
              className="w-full rounded-2xl border border-cyan-100 bg-white/90 px-4 py-4 font-bold text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100"
            />
          </div>
        </section>

        <section id="analysis-requests" className="space-y-5 scroll-mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-950">طلبات تحليل العملات</h2>
              <p className="mt-2 text-slate-600">اكتب الرد وارفق صورة الشارت ثم أرسلها للمستخدم.</p>
            </div>
          </div>

          {filteredAnalysis.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-200/70 bg-white/85 p-10 text-center text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-100 bg-cyan-50 text-4xl">📭</div>
              <h3 className="text-2xl font-black text-slate-950">لا توجد طلبات تحليل حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAnalysis.map((req) => (
                <article
                  key={req.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-[30px] border border-cyan-200/70 bg-white/85 p-5 text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl"
                >
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 break-words text-2xl font-black leading-tight text-slate-950 md:text-3xl">
                        {req.coin}
                      </h3>
                      <StatusBadge status={req.status} />
                    </div>

                    <div className="flex min-w-0 flex-wrap gap-2 text-sm">
                      <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-3 py-2 text-slate-800">
                        المستخدم: <b className="text-slate-950">{req.username || req.userEmail}</b>
                      </span>
                      <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-3 py-2 text-slate-800">
                        الفريم: <b className="text-slate-950">{req.frame}</b>
                      </span>
                      <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-3 py-2 text-slate-800">
                        التاريخ: <b className="text-slate-950">{req.createdAt}</b>
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
                        className="w-full shrink-0 rounded-2xl border border-cyan-200 bg-white/90 px-5 py-3 text-center text-sm font-black text-slate-950 shadow-[0_10px_30px_rgba(14,165,233,0.1)] transition hover:bg-cyan-50 sm:w-[168px]"
                      >
                        {expandedAnalysis[req.id] ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                      </button>
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("analysis_requests", req.id, e.target.value)}
                        className="min-w-0 flex-1 rounded-2xl border border-cyan-200 bg-white px-4 py-3 font-black text-slate-950 outline-none"
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
                      <div className="rounded-[26px] border border-cyan-100 bg-white/80 p-5 text-slate-950">
                        <p className="text-sm font-bold text-slate-800">الرد الحالي</p>
                        <p className="mt-2 break-words leading-8 text-slate-950">{req.reply}</p>
                        {isValidPreviewUrl(req.replyImage) && (
                          <button
                            type="button"
                            onClick={() => setProofPreview(req.replyImage)}
                            className="mt-4 block w-full overflow-hidden rounded-2xl border border-cyan-100 bg-slate-50 p-2 transition hover:border-cyan-200 hover:shadow-[0_12px_40px_rgba(14,165,233,0.14)]"
                            title="عرض صورة التحليل"
                          >
                            <img
                              src={req.replyImage}
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
                      className="min-h-32 w-full min-w-0 rounded-[20px] border border-cyan-100 bg-white/80 p-4 text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100"
                    />

                    <div className="rounded-[24px] border border-cyan-100 bg-white/80 p-4 text-slate-950">
                      <label className="block text-sm font-bold text-slate-800">أرفق صورة التحليل / الشارت</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleReplyImage(req.id, e.target.files[0])}
                        className="mt-3 w-full min-w-0 rounded-2xl border border-cyan-100 bg-white/90 p-3 text-slate-950"
                      />

                      {isValidPreviewUrl(replies[req.id]?.image) && (
                        <button
                          type="button"
                          onClick={() => setProofPreview(replies[req.id].image)}
                          className="mt-4 block w-full overflow-hidden rounded-2xl border border-cyan-100 bg-slate-50 p-2 transition hover:border-cyan-200"
                          title="معاينة الصورة"
                        >
                          <img
                            src={replies[req.id].image}
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

        {activeAdminTab === "accounts" && (
        <section className="space-y-5 scroll-mt-6">
          <div>
            <h2 className="text-3xl font-black text-slate-950">طلبات إدارة الحسابات</h2>
            <p className="mt-2 text-slate-600">مراجعة طلبات إدارة المحافظ والحسابات من العملاء.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {ADMIN_STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAccountFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    accountFilter === key
                      ? "border-cyan-200 bg-cyan-50 text-slate-950 shadow-[0_0_25px_rgba(14,165,233,0.12)]"
                      : "border-cyan-100 bg-white/80 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50"
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
                className="w-full rounded-2xl border border-cyan-100 bg-white/90 px-4 py-4 font-bold text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100"
              />
            </div>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-200/70 bg-white/85 p-10 text-center text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-100 bg-cyan-50 text-4xl">📂</div>
              <h3 className="text-2xl font-black text-slate-950">لا توجد طلبات إدارة حسابات حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-5">
              {filteredAccounts.map((req) => {
                const revealedKeys = accountKeys[req.id];

                return (
                <article key={req.id} className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-6 text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-black text-slate-950">{req.type}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{req.createdAt}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("account_management_requests", req.id, e.target.value)}
                        className="rounded-2xl border border-cyan-200 bg-white px-4 py-3 font-black text-slate-950 outline-none"
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
                        <div key={item.label} className="rounded-2xl border border-cyan-100 bg-white/90 p-4">
                          <p className="text-xs font-bold text-slate-800">{item.label}</p>
                          <p className="mt-2 break-all font-bold text-slate-950">{item.value}</p>
                        </div>
                      ))}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
        )}

        {activeAdminTab === "subscriptions" && (
        <section className="space-y-5 scroll-mt-6">
          <div>
            <h2 className="text-3xl font-black text-slate-950">طلبات الاشتراكات والدفع</h2>
            <p className="mt-2 text-slate-600">مراجعة طلبات اشتراك Spot & Futures وتفعيلها للمستخدمين.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {ADMIN_STATUS_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSubscriptionFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    subscriptionFilter === key
                      ? "border-cyan-200 bg-cyan-50 text-slate-950 shadow-[0_0_25px_rgba(14,165,233,0.12)]"
                      : "border-cyan-100 bg-white/80 text-slate-800 hover:border-cyan-200 hover:bg-cyan-50"
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
                className="w-full rounded-2xl border border-cyan-100 bg-white/90 px-4 py-4 font-bold text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100"
              />
            </div>
          </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-200/70 bg-white/85 p-10 text-center text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-100 bg-cyan-50 text-4xl">💳</div>
              <h3 className="text-2xl font-black text-slate-950">لا توجد طلبات اشتراك حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-5">
              {filteredSubscriptions.map((req) => (
                <article key={req.id} className="rounded-[30px] border border-cyan-200/70 bg-white/85 p-6 text-slate-950 shadow-[0_20px_70px_rgba(14,165,233,0.14)] backdrop-blur-2xl">
                  <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-black text-slate-950">{req.planName}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-4 py-2 text-slate-800">
                          المستخدم: <b className="text-slate-950">{req.username || req.userEmail}</b>
                        </span>
                        <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-4 py-2 text-slate-800">
                          النوع: <b className="text-slate-950">{req.category}</b>
                        </span>
                        <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-4 py-2 text-slate-800">
                          السعر: <b className="text-slate-950">{req.price}</b>
                        </span>
                        {req.telegramUsername && (
                          <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-4 py-2 text-slate-800">
                            تليجرام: <b className="text-slate-950">{req.telegramUsername}</b>
                          </span>
                        )}
                        <span className="max-w-full rounded-full border border-cyan-100 bg-white/80 px-4 py-2 text-slate-800">
                          التاريخ: <b className="text-slate-950">{req.createdAt}</b>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={getSimpleStatusSelectValue(req.status)}
                        onChange={(e) => updateRequestStatus("subscription_requests", req.id, e.target.value)}
                        className="rounded-2xl border border-cyan-200 bg-white px-4 py-3 font-black text-slate-950 outline-none"
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
                        <div className="rounded-2xl border border-cyan-100 bg-white/90 p-4">
                          <p className="text-xs font-bold text-slate-800">يوزر التليجرام</p>
                          <p className="mt-2 break-all font-bold text-slate-950">{req.telegramUsername}</p>
                        </div>
                      )}

                      {isValidPreviewUrl(req.paymentProof) && (
                        <div className="rounded-2xl border border-cyan-100 bg-white/90 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold text-slate-800">إثبات الدفع</p>
                              <p className="mt-2 font-bold text-slate-950">صورة إشعار الدفع مرفقة</p>
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
                            <img
                              src={req.paymentProof}
                              alt="إثبات الدفع"
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
        )}
      </div>
    </main>
  );
}
