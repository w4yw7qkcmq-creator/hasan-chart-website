"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "./admin-fetch";
import {
  buildAdminActionKey,
  createAdminActionInFlightRegistry,
  resolveAdminActionMessages,
  resolveAdminActionToastOutcome,
  runAdminUserActionFlow,
  runIsolatedPostActionRefresh,
  shouldBlockDuplicateAdminAction,
} from "./admin-user-action-flow.js";
import {
  createAdminUserNote,
  deleteAdminUserNote,
  fetchAdminUserSection,
  postAdminUserAction,
  updateAdminUserNote,
} from "./admin-user-management-client";
import { sanitizeAdminUserFacingError } from "./admin-user-management-shared";
import {
  ADMIN_SUBSCRIPTION_REMOVED_EVENT,
  dispatchAdminSubscriptionRemovedEvent,
  mapSubscriptionRowForRemoveModal,
  postAdminSubscriptionRemove,
} from "./admin-subscription-remove-client";
import { ADMIN_SUBSCRIPTION_UPDATED_EVENT } from "./admin-subscription-updated-client";
import { notify } from "./notification-center";

export const USER_CENTER_TABS = [
  { id: "overview", label: "المعلومات", icon: "📋" },
  { id: "services", label: "الخدمات", icon: "⚙️" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "payments", label: "إثباتات الدفع", icon: "🧾" },
  { id: "activity", label: "النشاط", icon: "📈" },
  { id: "communications", label: "التواصل", icon: "📬" },
  { id: "notes", label: "الملاحظات", icon: "📝" },
  { id: "management", label: "الإدارة", icon: "🛡️" },
];

export const ACTION_REFRESH_MAP = {
  suspend_user: ["overview", "management", "activity"],
  unsuspend_user: ["overview", "management", "activity"],
  ban_user: ["overview", "management", "activity"],
  unban_user: ["overview", "management", "activity"],
  soft_delete_user: ["overview", "management", "activity"],
  restore_user: ["overview", "management", "activity"],
  force_logout: ["activity"],
  password_reset_requested: ["activity"],
  activate_service: ["overview", "services"],
  deactivate_service: ["overview", "services"],
  extend_subscription: ["overview", "services", "subscriptions", "activity"],
};

const SELF_BLOCKED_ACTIONS = new Set([
  "suspend_user",
  "ban_user",
  "soft_delete_user",
  "force_logout",
]);

function showAdminToast(title, body, type = "success") {
  void notify({
    key: type === "error" ? "admin_user_action_error" : "admin_user_action_success",
    title,
    body,
    persist: false,
    skipSound: true,
    source: "admin-user-management",
    metadata: { type, adminToastType: type },
  });
}

export function useAdminUserCenter({
  userId,
  enabled = true,
  currentAdminUserId = "",
  initialTab = "overview",
  allowedTabs = null,
  onUserUpdated,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sectionData, setSectionData] = useState({});
  const [sectionState, setSectionState] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [pages, setPages] = useState({});
  const [activityFilter, setActivityFilter] = useState("all");
  const [subscriptionRemoveTarget, setSubscriptionRemoveTarget] = useState(null);
  const [subscriptionRemoveLoading, setSubscriptionRemoveLoading] = useState(false);
  const [subscriptionRemoveApiError, setSubscriptionRemoveApiError] = useState("");

  const abortBySectionRef = useRef({});
  const loadedRef = useRef({});
  const inFlightRef = useRef(false);
  const actionInFlightRegistryRef = useRef(createAdminActionInFlightRegistry());
  const mountedRef = useRef(true);
  const onUserUpdatedRef = useRef(onUserUpdated);
  const overviewUserRef = useRef(null);

  const tabs = allowedTabs
    ? USER_CENTER_TABS.filter((tab) => allowedTabs.includes(tab.id))
    : USER_CENTER_TABS;

  useEffect(() => {
    onUserUpdatedRef.current = onUserUpdated;
  }, [onUserUpdated]);

  useEffect(() => {
    overviewUserRef.current = sectionData.overview?.user || null;
  }, [sectionData.overview?.user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of Object.values(abortBySectionRef.current)) {
        controller?.abort();
      }
      abortBySectionRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    for (const controller of Object.values(abortBySectionRef.current)) {
      controller?.abort();
    }
    abortBySectionRef.current = {};
  }, [enabled]);

  const setSectionPayload = useCallback((section, payload) => {
    setSectionData((current) => ({ ...current, [section]: payload }));
  }, []);

  const loadSection = useCallback(
    async (section, { page = 1, force = false, activityFilter: nextActivityFilter } = {}) => {
      if (!userId || !enabled) return;

      const resolvedActivityFilter =
        nextActivityFilter !== undefined ? nextActivityFilter : activityFilter;
      const cacheKey =
        section === "activity"
          ? `${section}:${page}:${resolvedActivityFilter}`
          : `${section}:${page}`;
      if (!force && loadedRef.current[cacheKey]) return;

      abortBySectionRef.current[section]?.abort();
      const controller = new AbortController();
      abortBySectionRef.current[section] = controller;
      const isActiveRequest = () =>
        mountedRef.current && abortBySectionRef.current[section] === controller;

      setSectionState((current) => ({
        ...current,
        [section]: { ...(current[section] || {}), loading: true, error: "" },
      }));

      try {
        const result = await fetchAdminUserSection(adminFetch, userId, section, {
          page,
          signal: controller.signal,
          activityFilter: section === "activity" ? resolvedActivityFilter : undefined,
        });

        if (!isActiveRequest()) return;

        setSectionPayload(section, result);
        loadedRef.current[cacheKey] = true;

        setSectionState((current) => ({
          ...current,
          [section]: { loading: false, error: "", loaded: true },
        }));
      } catch (error) {
        if (error?.name === "AbortError" || !isActiveRequest()) return;

        const sanitized = sanitizeAdminUserFacingError(error);

        setSectionState((current) => ({
          ...current,
          [section]: {
            loading: false,
            error: sanitized.message,
            errorKind: sanitized.kind,
            detail: sanitized.detail,
            loaded: sanitized.kind === "not_enabled",
          },
        }));
      }
    },
    [activityFilter, enabled, setSectionPayload, userId]
  );

  const invalidateSections = useCallback((sections) => {
    for (const key of Object.keys(loadedRef.current)) {
      if (sections.some((section) => key.startsWith(`${section}:`))) {
        delete loadedRef.current[key];
      }
    }
  }, []);

  const refreshSections = useCallback(
    (sections) => {
      const expanded = (sections || []).flatMap((section) =>
        section === "communications" ? ["notifications", "emails"] : [section]
      );
      invalidateSections(expanded);
      for (const section of expanded) {
        const page = pages[section] || 1;
        void loadSection(section, { page, force: true });
      }
    },
    [invalidateSections, loadSection, pages]
  );

  const refreshSectionsSafe = useCallback(
    async (sections) => {
      return runIsolatedPostActionRefresh(async () => {
        refreshSections(sections);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    },
    [refreshSections]
  );

  useEffect(() => {
    if (!enabled || !userId) return undefined;

    const handleSubscriptionRemoved = (event) => {
      const detail = event?.detail || {};
      const eventUserId = String(detail.userId || "").trim();
      const eventEmail = String(detail.userEmail || "").trim().toLowerCase();
      const currentId = String(userId || "").trim();
      const currentEmail = String(overviewUserRef.current?.email || "").trim().toLowerCase();

      if (eventUserId && eventUserId !== currentId) return;
      if (!eventUserId && eventEmail && currentEmail && eventEmail !== currentEmail) return;

      refreshSections(["overview", "services", "subscriptions", "activity"]);
    };

    window.addEventListener(ADMIN_SUBSCRIPTION_REMOVED_EVENT, handleSubscriptionRemoved);
    const handleSubscriptionUpdated = (event) => {
      const detail = event?.detail || {};
      const eventUserId = String(detail.userId || "").trim();
      const eventEmail = String(detail.userEmail || "").trim().toLowerCase();
      const currentId = String(userId || "").trim();
      const currentEmail = String(overviewUserRef.current?.email || "").trim().toLowerCase();

      if (eventUserId && eventUserId !== currentId) return;
      if (!eventUserId && eventEmail && currentEmail && eventEmail !== currentEmail) return;

      refreshSections(["overview", "services", "subscriptions", "activity"]);
    };

    window.addEventListener(ADMIN_SUBSCRIPTION_UPDATED_EVENT, handleSubscriptionUpdated);
    return () => {
      window.removeEventListener(ADMIN_SUBSCRIPTION_REMOVED_EVENT, handleSubscriptionRemoved);
      window.removeEventListener(ADMIN_SUBSCRIPTION_UPDATED_EVENT, handleSubscriptionUpdated);
    };
  }, [enabled, refreshSections, userId]);

  const requestSubscriptionRemove = useCallback(
    (sub) => {
      const overviewUser = overviewUserRef.current;
      setSubscriptionRemoveApiError("");
      setSubscriptionRemoveTarget(mapSubscriptionRowForRemoveModal(sub, overviewUser));
    },
    []
  );

  const cancelSubscriptionRemove = useCallback(() => {
    if (subscriptionRemoveLoading) return;
    setSubscriptionRemoveTarget(null);
    setSubscriptionRemoveApiError("");
  }, [subscriptionRemoveLoading]);

  const confirmSubscriptionRemoval = useCallback(
    async ({ notes }) => {
      const target = subscriptionRemoveTarget;
      if (!target?.id || subscriptionRemoveLoading) return;

      setSubscriptionRemoveLoading(true);
      setSubscriptionRemoveApiError("");

      try {
        await postAdminSubscriptionRemove(adminFetch, target.id, { removalNotes: notes });

        setSectionData((current) => {
          const section = current.subscriptions;
          if (!section?.subscriptions?.length) return current;

          return {
            ...current,
            subscriptions: {
              ...section,
              subscriptions: section.subscriptions.map((sub) =>
                String(sub.id) === String(target.id)
                  ? {
                      ...sub,
                      status: "منتهي (إدارة)",
                      rawStatus: "منتهي",
                      adminDisabled: true,
                    }
                  : sub
              ),
            },
          };
        });

        dispatchAdminSubscriptionRemovedEvent({
          requestId: target.id,
          userEmail: target.userEmail,
          userId,
          planName: target.planName,
          status: "منتهي",
        });

        try {
          await refreshSectionsSafe(["overview", "services", "subscriptions", "activity"]);
        } catch (refreshError) {
          console.warn("CRM subscription remove refresh failed:", refreshError?.message || refreshError);
        }

        setSubscriptionRemoveTarget(null);
        showAdminToast("تم الإزالة", "تم إزالة الاشتراك");
        try {
          onUserUpdatedRef.current?.();
        } catch (callbackError) {
          console.warn("Admin onUserUpdated callback failed:", callbackError?.message || callbackError);
        }
      } catch (error) {
        setSubscriptionRemoveApiError(error?.message || "تعذر إزالة الاشتراك");
      } finally {
        setSubscriptionRemoveLoading(false);
      }
    },
    [refreshSectionsSafe, subscriptionRemoveLoading, subscriptionRemoveTarget, userId]
  );

  useEffect(() => {
    if (!enabled || !userId) return;

    setActiveTab(initialTab);
    setSectionData({});
    setSectionState({});
    setPages({});
    loadedRef.current = {};

    void loadSection("overview", { force: true });
  }, [enabled, initialTab, loadSection, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    if (!tabs.some((tab) => tab.id === activeTab)) return;

    const page = pages[activeTab] || 1;
    if (activeTab === "communications") {
      void loadSection("notifications", { page });
      void loadSection("emails", { page });
      return;
    }
    void loadSection(activeTab, { page, activityFilter: activeTab === "activity" ? activityFilter : undefined });
    if (activeTab === "management") {
      void loadSection("audit", { page: pages.audit || 1 });
    }
  }, [activeTab, activityFilter, enabled, loadSection, pages, tabs, userId]);

  const handleActivityFilterChange = useCallback(
    (nextFilter) => {
      setActivityFilter(nextFilter);
      invalidateSections(["activity"]);
      void loadSection("activity", { page: 1, force: true, activityFilter: nextFilter });
    },
    [invalidateSections, loadSection]
  );

  const runAction = async (
    action,
    {
      payload = {},
      dangerous = false,
      targetEmail = "",
      reason = "",
      refresh = null,
      requireReason = false,
    } = {}
  ) => {
    if (shouldBlockDuplicateAdminAction({ inFlight: inFlightRef.current, actionLoading })) {
      return;
    }

    if (SELF_BLOCKED_ACTIONS.has(action) && String(currentAdminUserId || "") === String(userId || "")) {
      showAdminToast("غير مسموح", "لا يمكنك تنفيذ هذا الإجراء على حسابك الشخصي", "error");
      return;
    }

    if (dangerous && confirmEmail.trim().toLowerCase() !== String(targetEmail || "").trim().toLowerCase()) {
      showAdminToast("تأكيد مطلوب", "اكتب البريد الإلكتروني للمستخدم للتأكيد", "error");
      return;
    }

    const resolvedReason = String(reason || actionReason || payload.reason || "").trim();
    if (requireReason && !resolvedReason) {
      showAdminToast("سبب مطلوب", "يجب كتابة سبب الإجراء", "error");
      return;
    }

    const serviceKey = payload.serviceKey || payload.service || "";
    const subscriptionId = payload.subscriptionId || "";
    const actionKey = buildAdminActionKey({ action, userId, serviceKey, subscriptionId });

    inFlightRef.current = true;
    setActionLoading(action);

    const actionMessages = resolveAdminActionMessages({ action, serviceKey });

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: actionInFlightRegistryRef.current,
      execute: async () =>
        postAdminUserAction(adminFetch, userId, {
          action,
          service: serviceKey,
          reason: resolvedReason,
          durationDays: payload.days,
          expiresAt: payload.expiresAt,
          subscriptionId,
          confirmEmail: dangerous ? confirmEmail : "",
          payload,
        }),
      refresh: async () => {
        const refreshResult = await refreshSectionsSafe(
          refresh || ACTION_REFRESH_MAP[action] || ["overview"]
        );
        if (!refreshResult.ok) {
          throw new Error(refreshResult.message || "refresh failed");
        }
      },
      successMessage: actionMessages.success,
      errorMessage: actionMessages.error,
      onSuccess: () => {
        setPendingAction(null);
        setConfirmEmail("");
        setActionReason("");
      },
      onRefreshFailed: (message) => {
        console.warn("Admin action refresh failed:", message);
      },
    });

    inFlightRef.current = false;
    setActionLoading("");

    if (flowResult.blocked) {
      return;
    }

    const toastOutcome = resolveAdminActionToastOutcome({
      actionSucceeded: flowResult.success,
      actionErrorMessage: flowResult.errorMessage,
      successMessage: flowResult.successMessage,
    });

    if (flowResult.success) {
      showAdminToast(
        "تم التنفيذ",
        flowResult.refreshFailed
          ? "تم تنفيذ الإجراء، وتعذر تحديث بعض البيانات تلقائياً."
          : flowResult.successMessage,
        "success"
      );
    } else {
      showAdminToast(toastOutcome.title, toastOutcome.body, toastOutcome.type);
      return;
    }

    try {
      onUserUpdatedRef.current?.();
    } catch (refreshError) {
      console.warn("Admin onUserUpdated callback failed:", refreshError?.message || refreshError);
    }
  };

  const handlePageChange = (section, page) => {
    setPages((current) => ({ ...current, [section]: page }));
    invalidateSections([section]);
    void loadSection(section, { page, force: true });
  };

  const noteHandlers = {
    onAddNote: async (text) => {
      try {
        await createAdminUserNote(adminFetch, userId, text);
        showAdminToast("تمت الإضافة", "أُضيفت الملاحظة بنجاح");
        refreshSections(["notes", "activity"]);
      } catch (error) {
        showAdminToast("فشل", error?.message || "تعذر إضافة الملاحظة", "error");
      }
    },
    onUpdateNote: async (noteId, text) => {
      try {
        await updateAdminUserNote(adminFetch, userId, { noteId, note: text });
        showAdminToast("تم التحديث", "حُدّثت الملاحظة بنجاح");
        refreshSections(["notes", "activity"]);
      } catch (error) {
        showAdminToast("فشل", error?.message || "تعذر تحديث الملاحظة", "error");
      }
    },
    onDeleteNote: async (noteId) => {
      try {
        await deleteAdminUserNote(adminFetch, userId, noteId);
        showAdminToast("تم الحذف", "حُذفت الملاحظة");
        refreshSections(["notes", "activity"]);
      } catch (error) {
        showAdminToast("فشل", error?.message || "تعذر حذف الملاحظة", "error");
      }
    },
    onTogglePinNote: async (noteId, isPinned) => {
      try {
        await updateAdminUserNote(adminFetch, userId, { noteId, isPinned });
        showAdminToast(isPinned ? "تم التثبيت" : "تم إلغاء التثبيت", "حُدّثت الملاحظة");
        refreshSections(["notes"]);
      } catch (error) {
        showAdminToast("فشل", error?.message || "تعذر تحديث الملاحظة", "error");
      }
    },
  };

  return {
    tabs,
    activeTab,
    setActiveTab,
    sectionData,
    sectionState,
    pages,
    actionLoading,
    pendingAction,
    setPendingAction,
    confirmEmail,
    setConfirmEmail,
    actionReason,
    setActionReason,
    loadSection,
    refreshSections,
    runAction,
    handlePageChange,
    noteHandlers,
    activityFilter,
    handleActivityFilterChange,
    subscriptionRemoveTarget,
    subscriptionRemoveLoading,
    subscriptionRemoveApiError,
    requestSubscriptionRemove,
    cancelSubscriptionRemove,
    confirmSubscriptionRemoval,
  };
}
