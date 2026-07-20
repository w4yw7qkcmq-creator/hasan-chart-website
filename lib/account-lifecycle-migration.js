const MIGRATION_MESSAGE =
  "يتطلب نظام إدارة حالة الحساب تطبيق Migration المرحلة 3A (20260720_account_lifecycle_3a.sql)";

let cachedReady = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function getLifecycleMigrationMessage() {
  return MIGRATION_MESSAGE;
}

export async function isLifecycleMigrationReady(supabase) {
  if (cachedReady != null && Date.now() - cachedAt < CACHE_MS) {
    return cachedReady;
  }

  const probe = await supabase.from("profiles").select("account_status").limit(1);
  const ready = !probe.error || !/column .* does not exist/i.test(probe.error.message || "");

  cachedReady = ready;
  cachedAt = Date.now();
  return ready;
}

export async function assertLifecycleMigrationReady(supabase) {
  const ready = await isLifecycleMigrationReady(supabase);
  if (ready) return true;

  const error = new Error(MIGRATION_MESSAGE);
  error.status = 503;
  error.code = "LIFECYCLE_MIGRATION_REQUIRED";
  throw error;
}

export function invalidateLifecycleMigrationCache() {
  cachedReady = null;
  cachedAt = 0;
}
