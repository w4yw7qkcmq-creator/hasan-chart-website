#!/usr/bin/env node
/**
 * Verify notification toast gating logic (memory-only, no replay on init).
 * Run: node scripts/verify-notification-toast-init.mjs
 */

let initialized = false;
let initialSyncComplete = false;
const knownIds = new Set();
const toastedIds = new Set();
const toastQueue = [];

function markInitialSync(notifications) {
  notifications.forEach((item) => {
    knownIds.add(item.id);
    toastedIds.add(item.id);
  });
  initialized = true;
  initialSyncComplete = true;
}

function registerIncoming(notification, { announce = false } = {}) {
  if (knownIds.has(notification.id)) return null;
  knownIds.add(notification.id);

  if (announce) {
    if (!initialSyncComplete || toastedIds.has(notification.id)) return null;
    toastedIds.add(notification.id);
    toastQueue.push(notification.id);
  }

  return notification;
}

function simulateRefresh(notifications) {
  toastQueue.length = 0;

  if (!initialized) {
    markInitialSync(notifications);
    return toastQueue.length;
  }

  notifications.forEach((item) => {
    registerIncoming(item, { announce: true });
  });

  return toastQueue.length;
}

const existing = [
  { id: "n1", title: "VIP" },
  { id: "n2", title: "Price" },
];

const firstPass = simulateRefresh(existing);
const secondPass = simulateRefresh(existing);

const realtimePass = registerIncoming({ id: "n3", title: "New" }, { announce: true });
const replayPass = registerIncoming({ id: "n3", title: "New" }, { announce: true });

let failed = 0;

if (firstPass !== 0) failed += 1;
if (secondPass !== 0) failed += 1;
if (!realtimePass || toastQueue.length !== 1) failed += 1;
if (replayPass) failed += 1;

if (failed > 0) {
  console.error("❌ Notification toast init checks failed", {
    firstPass,
    secondPass,
    toastQueue,
    realtimePass,
    replayPass,
  });
  process.exit(1);
}

console.log("✅ Notification toast init checks passed");
