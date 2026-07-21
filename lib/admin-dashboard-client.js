export const ADMIN_DASHBOARD_SECTION_TIMEOUT_MS = 10_000;
export const ADMIN_CLIENT_SECTION_CACHE_MS = 30_000;

const sectionCache = new Map();

export function createAdminSectionState() {
  return {
    loading: false,
    refreshing: false,
    error: "",
    loaded: false,
    durationMs: null,
    returnedRows: null,
  };
}

export function logAdminSectionLoad(event, payload = {}) {
  console.info(event, payload);
}

export function getCachedAdminSection(section) {
  const entry = sectionCache.get(section);
  if (!entry) return null;
  return entry.data;
}

export function isAdminSectionCacheFresh(section) {
  const entry = sectionCache.get(section);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ADMIN_CLIENT_SECTION_CACHE_MS;
}

export function setCachedAdminSection(section, data) {
  sectionCache.set(section, {
    data,
    fetchedAt: Date.now(),
  });
}

export function invalidateAdminSectionCache(section) {
  if (section) {
    sectionCache.delete(section);
    return;
  }

  sectionCache.clear();
}

export async function fetchAdminDashboardSection(
  adminFetch,
  section,
  { signal, timeoutMs = ADMIN_DASHBOARD_SECTION_TIMEOUT_MS } = {}
) {
  const controller = signal ? null : new AbortController();
  const usedSignal = signal || controller.signal;
  let timeoutId = null;

  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const startedAt = Date.now();

  try {
    const response = await adminFetch(
      `/api/admin/dashboard?section=${encodeURIComponent(section)}`,
      {
        method: "GET",
        cache: "no-store",
        signal: usedSignal,
      }
    );

    const result = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      throw new Error(result?.error || "تعذر التحقق من صلاحية الإدارة");
    }

    if (!response.ok || !result?.success) {
      throw new Error(result?.error || "فشل تحميل قسم لوحة الإدارة");
    }

    return {
      ...result,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function mapAdminTabToSections(tabId) {
  switch (tabId) {
    case "analysis":
      return ["analysis"];
    case "accounts":
      return ["accounts"];
    case "subscriptions":
      return ["subscriptions"];
    case "user-management":
      return [];
    case "users":
      return ["users"];
    case "withdrawals":
      return ["withdrawals"];
    default:
      return [];
  }
}

export function getAdminTabRefreshSections(tabId) {
  if (tabId === "overview") {
    return ["stats", "overview", "activity-feed"];
  }

  return mapAdminTabToSections(tabId);
}

export const ADMIN_SHELL_SECTIONS = ["stats", "overview"];
export const ADMIN_DEFERRED_SECTIONS = ["activity-feed"];
