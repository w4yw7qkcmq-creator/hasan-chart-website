const ACKNOWLEDGED_STORAGE_KEY = "admin-dashboard-notifications:acknowledged:v1";
const MAX_ACKNOWLEDGED_IDS = 300;

function readAcknowledgedIds() {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(ACKNOWLEDGED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeAcknowledgedIds(set) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      ACKNOWLEDGED_STORAGE_KEY,
      JSON.stringify([...set].slice(-MAX_ACKNOWLEDGED_IDS))
    );
  } catch {
    // ignore quota errors
  }
}

export function isAdminDashboardNotificationAcknowledged(id) {
  if (!id) return false;
  return readAcknowledgedIds().has(String(id));
}

export function acknowledgeAdminDashboardNotifications(ids = []) {
  const next = readAcknowledgedIds();

  ids.forEach((id) => {
    if (id) next.add(String(id));
  });

  writeAcknowledgedIds(next);
  return next.size;
}

export function filterUnacknowledgedAdminNotifications(items = []) {
  const acknowledged = readAcknowledgedIds();
  return items.filter((item) => item?.id && !acknowledged.has(String(item.id)));
}

export function countUnacknowledgedAdminNotifications(items = []) {
  return filterUnacknowledgedAdminNotifications(items).length;
}
