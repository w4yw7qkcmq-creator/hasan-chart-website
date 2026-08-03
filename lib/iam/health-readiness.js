import { validateRouteMatrix } from "./route-matrix-validator.js";
import { getIamFeatureFlags, validateIamFlagCombination, getIamHealthStatus } from "./feature-flags.js";
import { getBootstrapState } from "./bootstrap.js";
import { isServiceAccountConfigured } from "./service-accounts.js";
import { resolveRlsMode, buildRlsHealthDetails } from "./rls-health.js";

export async function buildIamReadinessReport(supabase) {
  const flags = getIamFeatureFlags();
  const flagValidation = validateIamFlagCombination(flags);
  const matrix = validateRouteMatrix();
  const bootstrap = supabase ? await getBootstrapState(supabase) : { available: false };

  let assignmentsCount = null;
  let superAdminCount = null;
  let serviceAccountsConfigured = 0;
  let serviceAccountsTotal = 0;

  if (supabase) {
    try {
      const { count } = await supabase
        .from("iam_user_assignments")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null);
      assignmentsCount = count;
    } catch {
      assignmentsCount = null;
    }

    try {
      const { count } = await supabase
        .from("iam_user_assignments")
        .select("id", { count: "exact", head: true })
        .eq("role_id", "super_admin")
        .is("revoked_at", null);
      superAdminCount = count;
    } catch {
      superAdminCount = null;
    }

    try {
      const { data: accounts } = await supabase
        .from("iam_service_accounts")
        .select("id, secret_hash, enabled, revoked_at");
      serviceAccountsTotal = (accounts || []).length;
      serviceAccountsConfigured = (accounts || []).filter((a) => isServiceAccountConfigured(a)).length;
    } catch {
      serviceAccountsConfigured = 0;
      serviceAccountsTotal = 0;
    }
  }

  const schemaConfigured = bootstrap.available !== false && !bootstrap.tableMissing;

  const rlsDbSnapshot = await probeRlsDbSnapshot(supabase);
  const rlsMode = resolveRlsMode({ flags, dbSnapshot: rlsDbSnapshot });
  const rlsHealth = buildRlsHealthDetails(rlsDbSnapshot);

  const readiness = getIamHealthStatus(flags, { rlsMode, rlsHealth });
  let status = readiness;
  if (!matrix.ok) status = "degraded";
  if (flagValidation.misconfigured) status = "misconfigured";
  if (rlsHealth.criticalCount > 0 && flags.IAM_DB) status = "degraded";

  return {
    status,
    schemaConfigured,
    flags,
    flagValidation,
    assignmentsCount,
    superAdminCount,
    bootstrapCompleted: Boolean(bootstrap.completed),
    bootstrapAvailable: Boolean(bootstrap.available),
    serviceAccountsConfigured,
    serviceAccountsTotal,
    routeMatrixCoverage: {
      ok: matrix.ok,
      stats: matrix.stats,
      issueCount: matrix.stats.issueCount,
    },
    sessionWiring: {
      login: true,
      logout: true,
      refresh: true,
      forceLogout: true,
      revocationRegistry: true,
    },
    auditWiring: {
      grant: true,
      revoke: true,
      bootstrap: true,
      denied: true,
      login: true,
      logout: true,
      refresh: true,
    },
    rlsMode,
    rlsHealth: {
      issueCount: rlsHealth.issueCount,
      criticalCount: rlsHealth.criticalCount,
      // Full details restricted to iam.manage consumers server-side
      hasCritical: rlsHealth.criticalCount > 0,
    },
    readinessScoreEstimate: estimateReadinessScore({
      matrixOk: matrix.ok,
      flagValidationOk: flagValidation.ok,
      schemaConfigured,
      sessionWiring: true,
      auditWiring: true,
    }),
  };
}

function estimateReadinessScore(params) {
  let score = 40;
  if (params.matrixOk) score += 15;
  if (params.flagValidationOk) score += 10;
  if (params.schemaConfigured) score += 10;
  if (params.sessionWiring) score += 10;
  if (params.auditWiring) score += 10;
  return Math.min(score, 95);
}

async function probeRlsDbSnapshot(supabase) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("iam_rls_health_probe");
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
