import { recordAdminAction, redactObject } from "./admin-audit-log.js";

export const LIFECYCLE_EVENTS = new Set([
  "user.suspended",
  "user.unsuspended",
  "user.banned",
  "user.unbanned",
  "user.soft_deleted",
  "user.restored",
  "user.force_signed_out",
  "user.password_reset_requested",
  "service.activated",
  "service.deactivated",
  "subscription.extended",
]);

const ACTION_TO_EVENT = {
  suspend_user: "user.suspended",
  unsuspend_user: "user.unsuspended",
  ban_user: "user.banned",
  unban_user: "user.unbanned",
  soft_delete_user: "user.soft_deleted",
  restore_user: "user.restored",
  force_logout: "user.force_signed_out",
  password_reset_requested: "user.password_reset_requested",
  activate_service: "service.activated",
  deactivate_service: "service.deactivated",
  extend_subscription: "subscription.extended",
};

const listeners = new Map();

function getListenerSet(eventName) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  return listeners.get(eventName);
}

export function registerLifecycleListener(eventName, listener) {
  const normalized = String(eventName || "").trim();
  if (!LIFECYCLE_EVENTS.has(normalized)) {
    throw new Error(`Unsupported lifecycle event: ${normalized}`);
  }
  if (typeof listener !== "function") {
    throw new Error("Lifecycle listener must be a function");
  }
  getListenerSet(normalized).add(listener);
  return () => getListenerSet(normalized).delete(listener);
}

export function mapActionToLifecycleEvent(action) {
  return ACTION_TO_EVENT[String(action || "").trim()] || null;
}

export async function emitLifecycleEvent(eventName, payload = {}) {
  const normalized = String(eventName || "").trim();
  if (!LIFECYCLE_EVENTS.has(normalized)) {
    console.warn("emitLifecycleEvent skipped: unsupported event", normalized);
    return { emitted: false };
  }

  const safePayload = redactObject(payload || {});
  const eventListeners = [...getListenerSet(normalized)];

  for (const listener of eventListeners) {
    try {
      await listener(safePayload);
    } catch (error) {
      console.warn(
        `Lifecycle listener failed for ${normalized}:`,
        error?.message || error
      );
    }
  }

  return { emitted: true, listeners: eventListeners.length };
}

async function auditLifecycleListener(payload) {
  const action = String(payload?.action || "").trim();
  if (!action) return;
  if (action === "extend_subscription") return;

  await recordAdminAction(payload?.supabase, {
    adminId: payload?.adminUser?.id || null,
    adminEmail: payload?.adminUser?.email || null,
    action,
    targetTable: payload?.targetTable || "profiles",
    targetId: payload?.targetUserId || payload?.entityId || "",
    details: redactObject({
      target_user_id: payload?.targetUserId || null,
      previous_state: payload?.previousState || null,
      next_state: payload?.nextState || null,
      reason: payload?.reason || null,
      service: payload?.service || null,
      metadata: payload?.metadata || {},
    }),
  });
}

let auditListenerRegistered = false;

export function ensureAuditLifecycleListener() {
  if (auditListenerRegistered) return;
  for (const eventName of LIFECYCLE_EVENTS) {
    registerLifecycleListener(eventName, auditLifecycleListener);
  }
  auditListenerRegistered = true;
}

ensureAuditLifecycleListener();

export async function emitLifecycleEventForAction(action, payload = {}) {
  const eventName = mapActionToLifecycleEvent(action);
  if (!eventName) return { emitted: false };
  return emitLifecycleEvent(eventName, { ...payload, action });
}
