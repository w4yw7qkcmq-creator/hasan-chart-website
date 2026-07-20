"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  createAdminUserNote,
  deleteAdminUserNote,
  fetchAdminUserSection,
  postAdminUserAction,
  updateAdminUserNote,
} from "../../../../lib/admin-user-management-client";
import { notify } from "../../../../lib/notification-center";
import AdminUserDrawerShell from "./AdminUserDrawerShell";

export const DRAWER_TABS = [
  { id: "overview", label: "المعلومات", icon: "📋" },
  { id: "services", label: "الخدمات", icon: "🧩" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "payments", label: "المدفوعات", icon: "💰" },
  { id: "notifications", label: "الإشعارات", icon: "📣" },
  { id: "emails", label: "البريد", icon: "✉️" },
  { id: "activity", label: "النشاط", icon: "🕒" },
  { id: "notes", label: "الملاحظات", icon: "📝" },
  { id: "management", label: "الإدارة", icon: "🛡️" },
];

const ACTION_REFRESH_MAP = {
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

export default function AdminUserDrawer({ open, userId, currentAdminUserId, onClose, onUserUpdated }) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [sectionData, setSectionData] = useState({});
  const [sectionState, setSectionState] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [pages, setPages] = useState({});

  const abortRef = useRef(null);
  const loadedRef = useRef({});
  const inFlightRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const setSectionPayload = useCallback((section, payload) => {
    setSectionData((current) => ({ ...current, [section]: payload }));
  }, []);

  const loadSection = useCallback(
    async (section, { page = 1, force = false } = {}) => {
      if (!userId) return;

      const cacheKey = `${section}:${page}`;
      if (!force && loadedRef.current[cacheKey]) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSectionState((current) => ({
        ...current,
        [section]: { ...(current[section] || {}), loading: true, error: "" },
      }));

      try {
        const result = await fetchAdminUserSection(adminFetch, userId, section, {
          page,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setSectionPayload(section, result);
        loadedRef.current[cacheKey] = true;

        setSectionState((current) => ({
          ...current,
          [section]: { loading: false, error: "", loaded: true },
        }));
      } catch (error) {
        if (error?.name === "AbortError") return;
        setSectionState((current) => ({
          ...current,
          [section]: {
            loading: false,
            error: error?.message || "تعذر تحميل القسم",
            loaded: false,
          },
        }));
      }
    },
    [setSectionPayload, userId]
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
      invalidateSections(sections);
      for (const section of sections) {
        const page = pages[section] || 1;
        void loadSection(section, { page, force: true });
      }
    },
    [invalidateSections, loadSection, pages]
  );

  useEffect(() => {
    if (!open || !userId) return;

    setActiveTab("overview");
    setSectionData({});
    setSectionState({});
    setPages({});
    loadedRef.current = {};

    void loadSection("overview", { force: true });
  }, [loadSection, open, userId]);

  useEffect(() => {
    if (!open || !userId) return;
    const page = pages[activeTab] || 1;
    void loadSection(activeTab, { page });
    if (activeTab === "management") {
      void loadSection("audit", { page: pages.audit || 1 });
    }
  }, [activeTab, loadSection, open, pages, userId]);

  const showToast = (title, body, type = "success") => {
    void notify({
      key: "admin_user_action",
      title,
      body,
      persist: false,
      skipSound: true,
      source: "admin-user-management",
      metadata: { type },
    });
  };

  const runAction = async (
    action,
    { payload = {}, dangerous = false, targetEmail = "", reason = "", refresh = null } = {}
  ) => {
    if (actionLoading || inFlightRef.current) return;

    if (SELF_BLOCKED_ACTIONS.has(action) && String(currentAdminUserId || "") === String(userId || "")) {
      showToast("غير مسموح", "لا يمكنك تنفيذ هذا الإجراء على حسابك الشخصي", "error");
      return;
    }

    if (dangerous && confirmEmail.trim().toLowerCase() !== String(targetEmail || "").trim().toLowerCase()) {
      showToast("تأكيد مطلوب", "اكتب البريد الإلكتروني للمستخدم للتأكيد", "error");
      return;
    }

    if (action === "suspend_user" && !String(reason || actionReason).trim()) {
      showToast("سبب مطلوب", "يجب كتابة سبب التعليق", "error");
      return;
    }

    inFlightRef.current = true;
    setActionLoading(action);
    try {
      await postAdminUserAction(adminFetch, userId, {
        action,
        service: payload.serviceKey || payload.service,
        reason: reason || actionReason || payload.reason || "",
        durationDays: payload.days,
        expiresAt: payload.expiresAt,
        subscriptionId: payload.subscriptionId,
        confirmEmail: dangerous ? confirmEmail : "",
        payload,
      });

      showToast("تم التنفيذ", "اكتمل الإجراء بنجاح");
      setPendingAction(null);
      setConfirmEmail("");
      setActionReason("");

      refreshSections(refresh || ACTION_REFRESH_MAP[action] || ["overview"]);
      onUserUpdated?.();
    } catch (error) {
      showToast("فشل الإجراء", error?.message || "تعذر تنفيذ العملية", "error");
    } finally {
      inFlightRef.current = false;
      setActionLoading("");
    }
  };

  const handlePageChange = (section, page) => {
    setPages((current) => ({ ...current, [section]: page }));
    invalidateSections([section]);
    void loadSection(section, { page, force: true });
  };

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <button type="button" className="admin-user-drawer__backdrop" onClick={onClose} aria-label="إغلاق" />
      <AdminUserDrawerShell
        activeTab={activeTab}
        tabs={DRAWER_TABS}
        onTabChange={setActiveTab}
        onClose={onClose}
        overview={sectionData.overview}
        services={sectionData.services}
        subscriptions={sectionData.subscriptions}
        payments={sectionData.payments}
        notifications={sectionData.notifications}
        emails={sectionData.emails}
        activity={sectionData.activity}
        notes={sectionData.notes}
        management={sectionData.management}
        audit={sectionData.audit}
        sectionState={sectionState}
        pages={pages}
        actionLoading={actionLoading}
        currentAdminUserId={currentAdminUserId}
        onPageChange={handlePageChange}
        onRefreshSection={(section) => refreshSections([section])}
        onRequestAction={setPendingAction}
        onRunAction={runAction}
        onAddNote={async (text) => {
          try {
            await createAdminUserNote(adminFetch, userId, text);
            showToast("تمت الإضافة", "أُضيفت الملاحظة بنجاح");
            refreshSections(["notes", "activity"]);
          } catch (error) {
            showToast("فشل", error?.message || "تعذر إضافة الملاحظة", "error");
          }
        }}
        onUpdateNote={async (noteId, text) => {
          try {
            await updateAdminUserNote(adminFetch, userId, { noteId, note: text });
            showToast("تم التحديث", "حُدّثت الملاحظة بنجاح");
            refreshSections(["notes", "activity"]);
          } catch (error) {
            showToast("فشل", error?.message || "تعذر تحديث الملاحظة", "error");
          }
        }}
        onDeleteNote={async (noteId) => {
          try {
            await deleteAdminUserNote(adminFetch, userId, noteId);
            showToast("تم الحذف", "حُذفت الملاحظة");
            refreshSections(["notes", "activity"]);
          } catch (error) {
            showToast("فشل", error?.message || "تعذر حذف الملاحظة", "error");
          }
        }}
      />

      {pendingAction
        ? createPortal(
            <div className="admin-user-delete-modal">
              <div className="admin-user-delete-modal__dialog admin-modal admin-user-confirm-modal">
                <p className="admin-user-confirm-modal__eyebrow">تأكيد الإجراء</p>
                <h3 className="admin-heading text-2xl">{pendingAction.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{pendingAction.description}</p>
                {pendingAction.requireReason ? (
                  <div className="mt-4">
                    <label className="text-xs font-bold text-slate-400">سبب التعليق (إلزامي)</label>
                    <textarea
                      value={actionReason}
                      onChange={(event) => setActionReason(event.target.value)}
                      className="admin-field mt-2 min-h-20 font-bold"
                      placeholder="اكتب سببًا واضحًا..."
                    />
                  </div>
                ) : null}
                {pendingAction.dangerous ? (
                  <div className="mt-4">
                    <label className="text-xs font-bold text-slate-400">اكتب البريد للتأكيد</label>
                    <input
                      value={confirmEmail}
                      onChange={(event) => setConfirmEmail(event.target.value)}
                      className="admin-field mt-2 font-bold"
                      placeholder={pendingAction.targetEmail || "email@example.com"}
                    />
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="admin-btn-surface px-5 py-3"
                    onClick={() => {
                      setPendingAction(null);
                      setConfirmEmail("");
                      setActionReason("");
                    }}
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    className={`admin-user-confirm-modal__confirm admin-user-confirm-modal__confirm--${pendingAction.tone || "neutral"}`}
                    onClick={() =>
                      void runAction(pendingAction.action, {
                        payload: pendingAction.payload || {},
                        dangerous: pendingAction.dangerous,
                        targetEmail: pendingAction.targetEmail,
                        reason: actionReason,
                        refresh: pendingAction.refresh,
                      })
                    }
                  >
                    {actionLoading ? "جاري التنفيذ..." : pendingAction.confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>,
    document.body
  );
}
