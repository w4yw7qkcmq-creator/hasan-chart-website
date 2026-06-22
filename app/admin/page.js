"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

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
  const isDone = status === "مكتمل" || status === "تم الرد" || status === "مفعل" || status === "نشط";
  const isPending = !status || status === "قيد المراجعة" || status === "بانتظار المراجعة" || status === "جديد";
  const isArchived = status === "مؤرشف";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        isArchived
          ? "border-slate-500/40 bg-slate-500/25 text-slate-100"
          : isDone
          ? "border-emerald-500/40 bg-emerald-500/25 text-emerald-50"
          : isPending
          ? "border-amber-500/40 bg-amber-400/25 text-amber-50"
          : "border-cyan-500/40 bg-cyan-400/25 text-cyan-50"
      }`}
    >
      {status || "بانتظار المراجعة"}
    </span>
  );
}

const SUPABASE_URL = "https://lzgsxdsumnteuwtjfqlm.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_XCZkQPsJymbmnNuBR9fMpw_SVEFwZm0";
const ADMIN_ANALYSIS_LIMIT = 50;
const ADMIN_USERS_LIMIT = 200;
const ADMIN_SUBSCRIPTIONS_LIMIT = 50;

const ANALYSIS_STATUS_OPTIONS = [
  "قيد المراجعة",
  "قيد التحليل",
  "تم الرد",
  "مكتمل",
  "مرفوض",
  "مؤرشف",
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  "بانتظار المراجعة",
  "تم التواصل",
  "قيد التفعيل",
  "مفعل",
  "مرفوض",
  "مؤرشف",
];

const ACCOUNT_STATUS_OPTIONS = [
  "جديد",
  "قيد المراجعة",
  "نشط",
  "مغلق",
  "مرفوض",
  "مؤرشف",
];

const ANALYSIS_FILTERS = [
  ["all", "كل طلبات التحليل"],
  ["pending", "بانتظار المراجعة"],
  ["processing", "قيد التحليل"],
  ["answered", "تم الرد"],
  ["rejected", "مرفوض"],
  ["archived", "مؤرشف"],
];

const SUBSCRIPTION_FILTERS = [
  ["all", "كل طلبات الاشتراك"],
  ["pending", "بانتظار المراجعة"],
  ["contacted", "تم التواصل"],
  ["active", "مفعل"],
  ["rejected", "مرفوض"],
  ["archived", "مؤرشف"],
];


const ACCOUNT_FILTERS = [
  ["all", "كل طلبات إدارة الحسابات"],
  ["new", "جديد"],
  ["reviewing", "قيد المراجعة"],
  ["active", "نشط"],
  ["closed", "مغلق"],
  ["archived", "مؤرشف"],
];

// --- Admin search helpers ---
const normalizeAdminSearch = (value) => String(value || "").trim().toLowerCase();

const matchesAdminSearch = (item, searchValue, fields) => {
  const query = normalizeAdminSearch(searchValue);
  if (!query) return true;

  return fields.some((field) =>
    normalizeAdminSearch(item?.[field]).includes(query)
  );
};

const getStoredAccessToken = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Session load error:", error);
      return SUPABASE_PUBLIC_KEY;
    }

    if (!session?.access_token) {
      return SUPABASE_PUBLIC_KEY;
    }

    return session.access_token;
  } catch (err) {
    console.error("Access token error:", err);
    return SUPABASE_PUBLIC_KEY;
  }
};

const adminSelect = async (table, query = "select=*") => {
  const accessToken = await getStoredAccessToken();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Admin select error:", {
      table,
      status: response.status,
      data,
    });

    if (
      data?.message?.includes("JWT") ||
      data?.message?.includes("expired") ||
      response.status === 401
    ) {
      return [];
    }

    throw new Error(data?.message || data?.hint || `فشل تحميل ${table}`);
  }

  return data || [];
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
  apiKey: item.api_key_encrypted ? "محفوظ بشكل مشفر" : "",
secretKey: item.secret_key_encrypted ? "محفوظ بشكل مشفر" : "",
password: item.trading_password_encrypted ? "محفوظ بشكل مشفر" : "",
hasSensitiveKeys: Boolean(
  item.api_key_encrypted ||
    item.secret_key_encrypted ||
    item.trading_password_encrypted
),
});

const upsertById = (list, item, limit) => {
  const filtered = list.filter((current) => current.id !== item.id);
  return [item, ...filtered].slice(0, limit);
};

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
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
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [lastNotificationIds, setLastNotificationIds] = useState([]);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const updateRequestStatus = async (table, requestId, newStatus) => {
    const confirmed = await confirmAdminAction(`هل تريد تغيير حالة الطلب إلى: ${newStatus}؟`);
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

  // Helper for admin API calls with auto session refresh
  const adminFetch = async (url, options = {}) => {
    const requestOptions = {
      ...options,
      credentials: "same-origin",
    };

    let response = await fetch(url, requestOptions);

    if (response.status !== 401) {
      return response;
    }

    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });

    if (!refreshResponse.ok) {
      return response;
    }

    response = await fetch(url, requestOptions);
    return response;
  };
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
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!currentUser) {
      showAdminNotice("يجب تسجيل الدخول أولاً", "error", "تنبيه");
      router.push("/login");
      return;
    }

    if (currentUser.role !== "admin") {
      showAdminNotice("هذه الصفحة خاصة بالإدارة فقط", "error", "غير مصرح");
      router.push("/login");
      return;
    }

    setIsAdmin(true);
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
    loadAdminData(currentUser);

    const touchUpdatedAt = () => {
      setLastUpdatedAt(new Date().toLocaleTimeString("ar"));
    };

    const handleAnalysisChange = (payload) => {
      if (payload.eventType === "DELETE") {
        setAnalysisRequests((prev) => prev.filter((item) => item.id !== payload.old.id));
        touchUpdatedAt();
        return;
      }

      if (!payload.new?.id) return;

      const formatted = formatAnalysisRequest(payload.new);
      setAnalysisRequests((prev) => upsertById(prev, formatted, ADMIN_ANALYSIS_LIMIT));
      touchUpdatedAt();
    };

    const handleSubscriptionChange = (payload) => {
      if (payload.eventType === "DELETE") {
        setSubscriptionRequests((prev) => prev.filter((item) => item.id !== payload.old.id));
        touchUpdatedAt();
        return;
      }

      if (!payload.new?.id) return;

      const formatted = formatSubscriptionRequest(payload.new);
      setSubscriptionRequests((prev) => upsertById(prev, formatted, ADMIN_SUBSCRIPTIONS_LIMIT));
      touchUpdatedAt();
    };

    // Realtime monitoring for account_management_requests
    const handleAccountManagementChange = (payload) => {
      if (payload.eventType === "DELETE") {
        setAccountRequests((prev) => prev.filter((item) => item.id !== payload.old.id));
        touchUpdatedAt();
        return;
      }

      if (!payload.new?.id) return;

      const formatted = formatAccountManagementRequest(payload.new);
      setAccountRequests((prev) => upsertById(prev, formatted, ADMIN_SUBSCRIPTIONS_LIMIT));
      touchUpdatedAt();
    };

    const handleProfileChange = (payload) => {
      if (payload.eventType === "DELETE") {
        setUsers((prev) => prev.filter((item) => item.id !== payload.old.id));
        touchUpdatedAt();
        return;
      }

      if (!payload.new?.id) return;

      setUsers((prev) => upsertById(prev, payload.new, ADMIN_USERS_LIMIT));
      touchUpdatedAt();
    };

    const channel = supabase
      .channel("admin-live-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_requests" },
        handleAnalysisChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_requests" },
        handleSubscriptionChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_management_requests" },
        handleAccountManagementChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        handleProfileChange
      )
      .subscribe();

    const backupInterval = setInterval(() => {
      loadAdminData(currentUser, { silent: true });
    }, 60000);

    return () => {
      clearInterval(backupInterval);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const loadAdminData = async (currentUser, options = {}) => {
    if (!options.silent) {
      setIsRefreshing(true);
    }

    const fallbackUsers = [
      {
        id: currentUser?.id || "admin-local",
        email: currentUser?.email || "admin@hasanchart.com",
        username: currentUser?.username || "admin",
        telegram: currentUser?.telegram || "@admin",
        role: currentUser?.role || "admin",
        subscription_plan: currentUser?.subscription_plan || "إدارة",
        subscription_status: currentUser?.subscription_status || "نشط",
      },
    ];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await adminFetch("/api/admin/dashboard", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "فشل تحميل بيانات لوحة الإدارة");
      }

      const formattedAnalysis = (result.analysis_requests || []).map(formatAnalysisRequest);
      const formattedSubscriptions = (result.subscription_requests || []).map(formatSubscriptionRequest);
      const formattedAccounts = (result.account_management_requests || []).map(formatAccountManagementRequest);

      setUsers(result.profiles?.length ? result.profiles : fallbackUsers);
      setAnalysisRequests(formattedAnalysis);
      setSubscriptionRequests(formattedSubscriptions);
      setAccountRequests(formattedAccounts);
      setDataMode("secure-api");
      setLastUpdatedAt(new Date().toLocaleTimeString("ar"));
    } catch (err) {
      console.error("Admin load error:", err);
      setUsers(fallbackUsers);
      setAnalysisRequests([]);
      setSubscriptionRequests([]);
      setAccountRequests([]);
      setDataMode("secure-api");
      setLastUpdatedAt(new Date().toLocaleTimeString("ar"));

      if (!options.silent) {
        showAdminNotice(
          err?.name === "AbortError"
            ? "انتهت مهلة تحميل لوحة الإدارة. جرّب تحديث الصفحة."
            : err?.message || "فشل تحميل بيانات لوحة الإدارة",
          "error"
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!browserNotificationsEnabled) return;

    const pendingSubscriptions = subscriptionRequests.filter(
      (item) => item.status === "بانتظار المراجعة" || item.status === "قيد المعالجة"
    );

    const pendingAccounts = accountRequests.filter(
      (item) => item.status === "جديد" || item.status === "بانتظار المراجعة"
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

      try {
        new Notification(item.title, {
          body: item.body,
          icon: "/favicon.png",
        });
      } catch (_) {}
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

  const updateUserRole = async (userId, newRole) => {
    const updated = users.map((user) =>
      user.id === userId ? { ...user, role: newRole } : user
    );

    setUsers(updated);

    if (dataMode === "supabase") {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) {
        showAdminNotice("لم يتم تحديث الدور في Supabase. تأكد من صلاحيات الأدمن أو سياسات RLS.", "error");
        return;
      }
    } else {
      localStorage.setItem(
        "adminUsers",
        JSON.stringify(updated.filter((user) => user.role !== "admin"))
      );
    }

    showAdminNotice("تم تحديث صلاحية المستخدم");
  };

  const updateUserSubscription = async (userId, plan, status) => {
    const updated = users.map((user) =>
      user.id === userId
        ? { ...user, subscription_plan: plan, subscription_status: status }
        : user
    );

    setUsers(updated);

    if (dataMode === "supabase") {
      const { error } = await supabase
        .from("profiles")
        .update({ subscription_plan: plan, subscription_status: status })
        .eq("id", userId);

      if (error) {
        showAdminNotice("لم يتم تحديث الاشتراك في Supabase. تأكد أن أعمدة subscription_plan و subscription_status موجودة.", "error");
        return;
      }
    } else {
      localStorage.setItem(
        "adminUsers",
        JSON.stringify(updated.filter((user) => user.role !== "admin"))
      );
    }

    showAdminNotice("تم تحديث اشتراك المستخدم");
  };

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
    const pendingAnalysis = analysisRequests.filter((req) => req.status !== "مكتمل" && req.status !== "تم الرد" && req.status !== "مؤرشف").length;
    const completedAnalysis = analysisRequests.filter((req) => req.status === "مكتمل" || req.status === "تم الرد").length;
    const pendingAccounts = accountRequests.filter((req) => req.status !== "نشط" && req.status !== "مغلق" && req.status !== "مؤرشف").length;
    const pendingSubscriptions = subscriptionRequests.filter((req) => req.status !== "مفعل" && req.status !== "مؤرشف").length;

    return { pendingAnalysis, completedAnalysis, pendingAccounts, pendingSubscriptions, usersCount: users.length };
  }, [analysisRequests, accountRequests, subscriptionRequests, users]);

  const adminNotifications = useMemo(() => {
    const subscriptionItems = subscriptionRequests
      .filter((item) => item.status === "بانتظار المراجعة" || item.status === "قيد المعالجة")
      .map((item) => ({
        id: `subscription-${item.id}`,
        type: "subscription",
        icon: "💳",
        title: "طلب اشتراك جديد",
        message: `${item.planName || "اشتراك جديد"} - ${item.userEmail || item.username || "مستخدم"}`,
        createdAt: item.createdAt,
      }));

    const accountItems = accountRequests
      .filter((item) => item.status === "جديد" || item.status === "بانتظار المراجعة")
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

  const filteredAnalysis = useMemo(() => {
    let list = analysisRequests;

    if (filter === "pending") list = list.filter((req) => req.status === "قيد المراجعة" || !req.status);
    else if (filter === "processing") list = list.filter((req) => req.status === "قيد التحليل");
    else if (filter === "answered") list = list.filter((req) => req.status === "تم الرد" || req.status === "مكتمل");
    else if (filter === "rejected") list = list.filter((req) => req.status === "مرفوض");
    else if (filter === "archived") list = list.filter((req) => req.status === "مؤرشف");
    else list = list.filter((req) => req.status !== "مؤرشف");

    return list.filter((req) =>
      matchesAdminSearch(req, analysisSearch, ["coin", "frame", "userEmail", "username", "status"])
    );
  }, [analysisRequests, filter, analysisSearch]);

  const filteredSubscriptions = useMemo(() => {
    let list = subscriptionRequests;

    if (subscriptionFilter === "pending") list = list.filter((req) => req.status === "بانتظار المراجعة" || req.status === "قيد المعالجة" || !req.status);
    else if (subscriptionFilter === "contacted") list = list.filter((req) => req.status === "تم التواصل");
    else if (subscriptionFilter === "active") list = list.filter((req) => req.status === "مفعل");
    else if (subscriptionFilter === "rejected") list = list.filter((req) => req.status === "مرفوض");
    else if (subscriptionFilter === "archived") list = list.filter((req) => req.status === "مؤرشف");
    else list = list.filter((req) => req.status !== "مؤرشف");

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
    let list = accountRequests;

    if (accountFilter === "new") list = list.filter((req) => req.status === "جديد" || !req.status);
    else if (accountFilter === "reviewing") list = list.filter((req) => req.status === "قيد المراجعة");
    else if (accountFilter === "active") list = list.filter((req) => req.status === "نشط");
    else if (accountFilter === "closed") list = list.filter((req) => req.status === "مغلق");
    else if (accountFilter === "archived") list = list.filter((req) => req.status === "مؤرشف");
    else list = list.filter((req) => req.status !== "مؤرشف");

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

  const logout = () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("hasan-chart-auth-session");

    supabase.auth.signOut().finally(() => {
      window.dispatchEvent(new Event("storage"));
      router.push("/login");
    });
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
    try {
      const response = await adminFetch("/api/admin/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "approve-account-request",
          requestId: id,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحديث حالة الطلب");
      }

      setAccountRequests((prev) =>
        prev.map((req) =>
          req.id === id
            ? { ...req, status: "قيد المراجعة", reviewedAt: new Date().toLocaleString("ar") }
            : req
        )
      );

      showAdminNotice("تم تحديث حالة طلب إدارة الحساب");
    } catch (error) {
      showAdminNotice(error?.message || "تعذر تحديث حالة الطلب", "error");
    }
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

  if (!isAdmin) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
        <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
          <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 text-4xl">🛡</div>
            <h1 className="text-3xl font-black">جاري التحقق من الصلاحية</h1>
            <p className="mt-3 leading-7 text-slate-700 dark:text-slate-400">هذه الصفحة مخصصة للإدارة فقط.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      {adminNotice.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[34px] border border-white/70 bg-white p-8 text-center text-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
            <div className={`mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border-4 ${adminNotice.type === "error" ? "border-red-400 text-red-500 shadow-[0_0_55px_rgba(239,68,68,0.25)]" : "border-emerald-400 text-emerald-500 shadow-[0_0_55px_rgba(52,211,153,0.35)]"}`}>
              <span className="text-5xl font-black">{adminNotice.type === "error" ? "!" : "✓"}</span>
            </div>
            <h3 className="text-3xl font-black leading-tight">{adminNotice.title}</h3>
            <p className="mt-4 leading-8 text-slate-600">{adminNotice.message}</p>
            <button
              onClick={() => setAdminNotice((current) => ({ ...current, open: false }))}
              className="mt-7 rounded-2xl px-8 py-3 text-lg font-black text-blue-600 transition hover:bg-blue-50"
            >
              حسناً
            </button>
          </div>
        </div>
      )}

      {adminConfirm.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[34px] border border-white/70 bg-white p-8 text-center text-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
            <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border-4 border-amber-400 text-amber-500 shadow-[0_0_55px_rgba(245,158,11,0.25)]">
              <span className="text-5xl font-black">؟</span>
            </div>
            <h3 className="text-3xl font-black leading-tight">تأكيد العملية</h3>
            <p className="mt-4 leading-8 text-slate-600">{adminConfirm.message}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button
                onClick={() => closeAdminConfirm(false)}
                className="rounded-2xl border border-slate-200 bg-slate-100 px-6 py-3 font-black text-slate-700 transition hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                onClick={() => closeAdminConfirm(true)}
                className="rounded-2xl bg-gradient-to-l from-red-700 via-red-500 to-rose-400 px-6 py-3 font-black text-white shadow-[0_14px_38px_rgba(239,68,68,0.32)] transition hover:brightness-110"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 space-y-8 p-4 text-slate-100 md:p-6">
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
              const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
              loadAdminData(currentUser);
            }}
            className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 font-black text-cyan-100 transition hover:bg-cyan-400/20"
          >
            تحديث الآن
          </button>
        </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
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
                  <div className="fixed left-1/2 top-24 z-[9999] w-[min(92vw,520px)] -translate-x-1/2 overflow-hidden rounded-[28px] border border-cyan-200 bg-white/95 p-4 text-right text-slate-950 shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <h3 className="text-lg font-black text-slate-950">مركز إشعارات الأدمن</h3>
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
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
                              }
                              if (item.type === "account") {
                                setAccountFilter("new");
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
                                {item.createdAt && <p className="mt-2 text-xs font-bold text-slate-500">{item.createdAt}</p>}
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
                onClick={logout}
                className="rounded-2xl border border-red-400/20 bg-red-500/15 px-6 py-4 font-black text-red-100 transition hover:bg-red-500/25"
              >
                تسجيل خروج الأدمن
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
          <AdminStat title="طلبات التحليل" value={analysisRequests.length} icon="🧠" subtitle="إجمالي الطلبات" />
          <AdminStat title="بانتظار الرد" value={stats.pendingAnalysis} icon="⏳" subtitle="طلبات تحتاج متابعة" tone="orange" />
          <AdminStat title="تم إنجازها" value={stats.completedAnalysis} icon="✅" subtitle="طلبات مكتملة" tone="green" />
          <AdminStat title="إدارة الحسابات" value={accountRequests.length} icon="📂" subtitle="طلبات العملاء" tone="red" />
          <AdminStat title="المستخدمون" value={stats.usersCount} icon="👥" subtitle={dataMode === "secure-api" ? "من Secure API" : dataMode === "supabase" ? "من Supabase" : "محلياً للتجربة"} tone="green" />
          <AdminStat title="طلبات الاشتراك" value={subscriptionRequests.length} icon="💳" subtitle={`${stats.pendingSubscriptions} بانتظار التفعيل`} tone="orange" />
        </section>

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

        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-black">إدارة المستخدمين والاشتراكات</h2>
              <p className="mt-2 text-slate-400">
                عرض المستخدمين، تغيير الصلاحية، وتفعيل باقات Spot & Futures.
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100">
              الوضع الحالي: {dataMode === "secure-api" ? "Secure API" : dataMode === "supabase" ? "Supabase" : "LocalStorage"}
            </span>
          </div>

          {users.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">👥</div>
              <h3 className="text-2xl font-black">لا يوجد مستخدمون حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-5">
              {users.map((user) => (
                <article key={user.id} className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
                  <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
                    <div className="flex items-center gap-4">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-300 text-lg font-black shadow-[0_0_30px_rgba(0,163,255,0.25)]">
                        {(user.username || user.email || "U").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-black text-slate-100">{user.username || "مستخدم"}</h3>
                        <p className="truncate text-sm text-slate-300">{user.email}</p>
                        <p className="mt-1 text-xs text-cyan-100/60">{user.telegram || "لا يوجد تليجرام"}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        value={user.role || "user"}
                        onChange={(e) => updateUserRole(user.id, e.target.value)}
                        className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 font-bold text-slate-100 outline-none"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>

                      <select
                        value={user.subscription_plan || "بدون اشتراك"}
                        onChange={(e) => updateUserSubscription(user.id, e.target.value, user.subscription_status || "نشط")}
                        className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 font-bold text-slate-100 outline-none"
                      >
                        <option value="بدون اشتراك">بدون اشتراك</option>
                        <option value="Spot - شهر">Spot - شهر</option>
                        <option value="Spot - 3 أشهر">Spot - 3 أشهر</option>
                        <option value="Spot - سنة">Spot - سنة</option>
                        <option value="Futures - شهر">Futures - شهر</option>
                        <option value="Futures - 3 أشهر">Futures - 3 أشهر</option>
                        <option value="Futures - سنة">Futures - سنة</option>
                      </select>

                      <select
                        value={user.subscription_status || "غير نشط"}
                        onChange={(e) => updateUserSubscription(user.id, user.subscription_plan || "بدون اشتراك", e.target.value)}
                        className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 font-bold text-slate-100 outline-none"
                      >
                        <option value="غير نشط">غير نشط</option>
                        <option value="نشط">نشط</option>
                        <option value="منتهي">منتهي</option>
                        <option value="موقوف">موقوف</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-bold text-slate-500">الصلاحية</p>
                      <p className="mt-2 font-black text-cyan-100">{user.role || "user"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-bold text-slate-500">الباقة</p>
                      <p className="mt-2 font-black text-cyan-100">{user.subscription_plan || "بدون اشتراك"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-bold text-slate-500">حالة الاشتراك</p>
                      <p className="mt-2 font-black text-cyan-100">{user.subscription_status || "غير نشط"}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-2xl md:p-5">
          <div className="flex flex-wrap gap-3">
            {ANALYSIS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                  filter === key
                    ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_25px_rgba(0,163,255,0.13)]"
                    : "border-cyan-300/15 bg-black/20 text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <input
              value={analysisSearch}
              onChange={(e) => setAnalysisSearch(e.target.value)}
              placeholder="بحث في طلبات التحليل: العملة، الفريم، البريد، المستخدم، الحالة..."
              className="w-full rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 font-bold text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
            />
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black">طلبات تحليل العملات</h2>
              <p className="mt-2 text-[#b7bdc6]">اكتب الرد وارفق صورة الشارت ثم أرسلها للمستخدم.</p>
            </div>
          </div>

          {filteredAnalysis.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">📭</div>
              <h3 className="text-2xl font-black">لا توجد طلبات تحليل حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAnalysis.map((req) => (
                <article key={req.id} className="relative overflow-hidden rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-2xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%)]" />
                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-3xl font-black text-slate-100">{req.coin}</h3>
                          <StatusBadge status={req.status} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 text-sm">
                          <span className="rounded-full border border-cyan-300/15 bg-black/20 px-4 py-2 text-slate-300">
                            المستخدم: <b className="text-cyan-100">{req.username || req.userEmail}</b>
                          </span>
                          <span className="rounded-full border border-cyan-300/15 bg-black/20 px-4 py-2 text-slate-300">
                            الفريم: <b className="text-cyan-100">{req.frame}</b>
                          </span>
                          <span className="rounded-full border border-cyan-300/15 bg-black/20 px-4 py-2 text-slate-300">
                            التاريخ: {req.createdAt}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setExpandedAnalysis((prev) => ({
                            ...prev,
                            [req.id]: !prev[req.id],
                          }))
                        }
                        className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 font-black text-cyan-100 transition hover:bg-cyan-400/20"
                      >
                        {expandedAnalysis[req.id] ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                      </button>
                      <select
                        value={req.status || "قيد المراجعة"}
                        onChange={(e) => updateRequestStatus("analysis_requests", req.id, e.target.value)}
                        className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 font-bold text-slate-100 outline-none"
                      >
                        {ANALYSIS_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>

                    {!expandedAnalysis[req.id] && req.reply && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/20 p-3 text-sm font-black text-emerald-50 shadow-[0_10px_28px_rgba(16,185,129,0.16)]">
                        تم الرد على هذا الطلب ✅
                      </div>
                    )}

                    {expandedAnalysis[req.id] && (
                      <div className="space-y-5 border-t border-white/10 pt-5">

                    {req.reply && (
                      <div className="rounded-[26px] border border-cyan-300/15 bg-white/[0.045] p-5">
                        <p className="text-sm font-bold text-cyan-100">الرد الحالي</p>
                        <p className="mt-2 leading-8 text-slate-100">{req.reply}</p>
                        {req.replyImage && (
                          <img
                            src={req.replyImage}
                            className="mt-4 max-h-[260px] rounded-2xl border border-cyan-300/15 object-contain"
                            alt="صورة التحليل"
                          />
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
                      className="min-h-32 w-full rounded-[20px] border border-cyan-300/15 bg-black/30 p-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
                    />

                    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <label className="block text-sm font-bold text-slate-300">أرفق صورة التحليل / الشارت</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleReplyImage(req.id, e.target.files[0])}
                        className="mt-3 w-full rounded-2xl border border-cyan-300/15 bg-black/30 p-3 text-slate-100"
                      />

                      {replies[req.id]?.image && (
                        <img
                          src={replies[req.id].image}
                          className="mt-4 max-h-[220px] rounded-2xl border border-cyan-300/15 object-contain"
                          alt="معاينة الصورة"
                        />
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        onClick={() => sendAnalysisReply(req.id)}
                        disabled={replySending[req.id]}
                        className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {replySending[req.id] ? "جاري الإرسال..." : "إرسال الرد"}
                      </button>

                      <button
                        onClick={() => deleteAnalysisRequest(req.id)}
                        className="rounded-2xl border border-red-400/20 bg-red-500/15 px-5 py-3 font-black text-red-100 transition hover:bg-red-500/25"
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

        <section className="space-y-5">
          <div>
            <h2 className="text-3xl font-black">طلبات إدارة الحسابات</h2>
            <p className="mt-2 text-slate-300">مراجعة طلبات إدارة المحافظ والحسابات من العملاء.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {ACCOUNT_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAccountFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    accountFilter === key
                      ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_25px_rgba(0,163,255,0.13)]"
                      : "border-cyan-300/15 bg-black/20 text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="بحث في إدارة الحسابات: البريد، التليجرام، المنصة، رأس المال، الحالة..."
                className="w-full rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 font-bold text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">📂</div>
              <h3 className="text-2xl font-black">لا توجد طلبات إدارة حسابات حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-5">
              {filteredAccounts.map((req) => {
                const revealedKeys = accountKeys[req.id];

                return (
                <article key={req.id} className="rounded-[30px] border border-[#263142] bg-[#111827]/80 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-black">{req.type}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-2 text-sm text-[#848e9c]">{req.createdAt}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <select
                        value={req.status || "جديد"}
                        onChange={(e) => updateRequestStatus("account_management_requests", req.id, e.target.value)}
                        className="rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-3 font-bold text-slate-100 outline-none"
                      >
                        {ACCOUNT_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
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
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs font-bold text-slate-500">{item.label}</p>
                          <p className="mt-2 break-all font-bold text-slate-100">{item.value}</p>
                        </div>
                      ))}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="space-y-5">
          <div>
            <h2 className="text-3xl font-black">طلبات الاشتراكات والدفع</h2>
            <p className="mt-2 text-slate-300">مراجعة طلبات اشتراك Spot & Futures وتفعيلها للمستخدمين.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {SUBSCRIPTION_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSubscriptionFilter(key)}
                  className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                    subscriptionFilter === key
                      ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_25px_rgba(0,163,255,0.13)]"
                      : "border-cyan-300/15 bg-black/20 text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input
                value={subscriptionSearch}
                onChange={(e) => setSubscriptionSearch(e.target.value)}
                placeholder="بحث في الاشتراكات: الباقة، البريد، المستخدم، التليجرام، السعر، الحالة..."
                className="w-full rounded-2xl border border-cyan-300/15 bg-black/30 px-4 py-4 font-bold text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
          </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">💳</div>
              <h3 className="text-2xl font-black">لا توجد طلبات اشتراك حالياً</h3>
            </div>
          ) : (
            <div className="grid gap-5">
              {filteredSubscriptions.map((req) => (
                <article key={req.id} className="rounded-[30px] border border-cyan-200 bg-white/95 p-6 text-slate-950 shadow-[0_22px_70px_rgba(14,165,233,0.16)] backdrop-blur-2xl">
                  <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-black text-slate-950">{req.planName}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-slate-600 shadow-sm">
                          المستخدم: <b className="text-slate-950">{req.username || req.userEmail}</b>
                        </span>
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-slate-600 shadow-sm">
                          النوع: <b className="text-slate-950">{req.category}</b>
                        </span>
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-slate-600 shadow-sm">
                          السعر: <b className="text-slate-950">{req.price}</b>
                        </span>
                        {req.telegramUsername && (
                          <span className="rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-slate-600 shadow-sm">
                            تليجرام: <b className="text-slate-950">{req.telegramUsername}</b>
                          </span>
                        )}
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-slate-600 shadow-sm">
                          التاريخ: {req.createdAt}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={req.status || "بانتظار المراجعة"}
                        onChange={(e) => {
                          if (e.target.value === "مفعل") {
                            updateSubscriptionRequest(req, "مفعل");
                          } else {
                            updateRequestStatus("subscription_requests", req.id, e.target.value);
                          }
                        }}
                        className="rounded-2xl border border-cyan-200 bg-white px-4 py-3 font-black text-slate-950 outline-none shadow-sm"
                      >
                        {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => updateSubscriptionRequest(req, "مفعل")}
                        className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(16,185,129,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        تفعيل الاشتراك
                      </button>
                      <button
                        onClick={() => updateSubscriptionRequest(req, "بانتظار الدفع")}
                        className="rounded-2xl bg-gradient-to-l from-amber-700 via-yellow-500 to-orange-300 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(245,158,11,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        بانتظار الدفع
                      </button>
                      <button
                        onClick={() => updateSubscriptionRequest(req, "مرفوض")}
                        className="rounded-2xl bg-gradient-to-l from-red-800 via-red-600 to-rose-400 px-5 py-3 font-black text-white shadow-[0_14px_38px_rgba(239,68,68,0.32)] transition hover:scale-[1.01] hover:brightness-110"
                      >
                        رفض
                      </button>
                    </div>
                  </div>
                  {(req.telegramUsername || req.paymentProof) && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {req.telegramUsername && (
                        <div className="rounded-3xl border border-cyan-200 bg-white p-4 shadow-[0_16px_50px_rgba(14,165,233,0.12)]">
                          <p className="text-xs font-black text-cyan-700">يوزر التليجرام</p>
                          <p className="mt-2 break-all font-black text-slate-950">{req.telegramUsername}</p>
                        </div>
                      )}

                      {req.paymentProof && (
                        <div className="rounded-3xl border border-cyan-200 bg-white p-4 shadow-[0_16px_50px_rgba(14,165,233,0.12)]">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-cyan-700">إثبات الدفع</p>
                              <p className="mt-2 font-black text-slate-950">صورة إشعار الدفع مرفقة</p>
                              <p className="mt-1 text-xs font-bold text-slate-500">اضغط على الصورة أو زر فتح الصورة لعرضها بدقة كاملة.</p>
                            </div>
                            <a
                              href={req.paymentProof}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-gradient-to-l from-blue-700 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)] transition hover:brightness-110"
                            >
                              فتح الصورة
                            </a>
                          </div>
                          <a
                            href={req.paymentProof}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 block overflow-hidden rounded-2xl border border-cyan-100 bg-slate-100 p-2 transition hover:border-cyan-300 hover:shadow-[0_16px_45px_rgba(14,165,233,0.18)]"
                            title="فتح إثبات الدفع بدقة كاملة"
                          >
                            <img
                              src={req.paymentProof}
                              alt="إثبات الدفع"
                              className="max-h-[340px] w-full rounded-xl object-contain"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
} 
