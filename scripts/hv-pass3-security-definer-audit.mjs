/**
 * Pass3 SECURITY DEFINER catalog audit — staging harness only.
 */
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PARTNER_FINANCIAL_SD_RPC_CONTRACT,
  classifyPostgrestRpcError,
  evaluateSecurityDefinerMatrix,
  resolveSecurityDefinerResidualGate,
  buildSecurityDefinerAuditFlags,
} from "../lib/security/partner-financial-sd-rpc-contract.js";

export {
  PARTNER_FINANCIAL_SD_RPC_CONTRACT,
  classifyPostgrestRpcError,
  evaluateSecurityDefinerMatrix,
  resolveSecurityDefinerResidualGate,
  buildSecurityDefinerAuditFlags,
};

export function buildSecurityDefinerCatalogSql(contracts = PARTNER_FINANCIAL_SD_RPC_CONTRACT) {
  const names = contracts.map((c) => `'${c.proname.replace(/'/g, "''")}'`).join(", ");
  return `
    SELECT p.proname,
           p.prosecdef AS security_definer,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           (SELECT option_value
            FROM pg_options_to_table(COALESCE(p.proconfig, ARRAY[]::text[]))
            WHERE option_name = 'search_path') AS search_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(ARRAY[${names}]::text[])
    ORDER BY p.proname, identity_args;
  `;
}

export function runStagingCatalogSql(root, sql, { timeoutMs = 20000, retries = 1 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = spawnSync("supabase", ["db", "query", "--linked", sql], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });
    if (result.error) {
      lastError = result.error;
      continue;
    }
    if (result.status !== 0) {
      lastError = new Error(result.stderr || result.stdout || "catalog_sql_failed");
      continue;
    }
    const raw = result.stdout || "";
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      try {
        return { ok: true, data: JSON.parse(raw.slice(jsonStart)), attempt };
      } catch (parseErr) {
        lastError = parseErr;
        continue;
      }
    }
    lastError = new Error("catalog_sql_no_json");
  }
  return { ok: false, error: lastError, attempt: retries };
}

export async function querySecurityDefinerCatalog(root, contracts = PARTNER_FINANCIAL_SD_RPC_CONTRACT) {
  const sql = buildSecurityDefinerCatalogSql(contracts);
  const result = runStagingCatalogSql(root, sql, { timeoutMs: 20000, retries: 1 });
  if (!result.ok) {
    return {
      method: "catalog",
      ok: false,
      rows: [],
      error: String(result.error?.message || result.error),
    };
  }
  return {
    method: "catalog",
    ok: true,
    rows: result.data?.rows || [],
    attempt: result.attempt,
  };
}

export async function runSecurityDefinerAudit({
  root,
  service,
  url,
  anonKey,
  record,
  report,
  runTag,
  ensureUser,
  trackRegistry,
  runRegistry,
  fixtureUserIds,
  password,
  fixtureDomain,
}) {
  const auditReport = {
    method: "catalog",
    matrix: [],
    catalogRows: [],
    zeroArgFalseNegativeClosed: true,
  };

  const catalog = await querySecurityDefinerCatalog(root);
  auditReport.catalog = catalog;
  auditReport.method = catalog.method;

  if (!catalog.ok) {
    throw new Error(`security_definer_catalog_unavailable:${catalog.error}`);
  }

  auditReport.catalogRows = catalog.rows;
  const matrix = evaluateSecurityDefinerMatrix(catalog.rows);
  auditReport.matrix = matrix.results;

  for (const entry of matrix.results) {
    record(`SD-${entry.proname}`, "security_definer", `${entry.proname} catalog contract`, "db-live", entry.ok, {
      candidateCount: entry.candidateCount,
      match: entry.match,
    });
    if (!entry.ok) {
      throw new Error(`security_definer_contract_failed:${entry.proname}:${entry.match?.reason || "missing"}`);
    }
  }

  const probeFn = "credit_partner_qualified_referral_reward_atomic";
  const residual = resolveSecurityDefinerResidualGate({ matrix, probeFn });
  auditReport.residualClassifier = residual;
  record(
    "SD-zero-arg-classifier",
    "security_definer",
    "catalog authoritative; zero-arg service probe not required",
    "db-live",
    residual.liveGatePass,
    {
      catalogAuthoritative: true,
      zeroArgExecutionRequired: false,
      zeroArgFalseNegativeClosed: residual.zeroArgFalseNegativeClosed,
      note: "no_service_role_zero_arg_existence_probe_after_catalog_pass",
    }
  );
  if (!residual.liveGatePass) {
    throw new Error(`security_definer_residual_classifier_failed:${probeFn}`);
  }

  Object.assign(report, buildSecurityDefinerAuditFlags(matrix));
  report.securityDefinerAudit = auditReport;

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRpc = await anon.rpc(probeFn, {});
  record("SD-anon-deny", "security_definer", "QRR RPC anon denied", "db-live", Boolean(anonRpc.error), {
    error: anonRpc.error?.message || null,
    classification: classifyPostgrestRpcError(anonRpc.error, probeFn),
  });
  if (!anonRpc.error) throw new Error("security_definer_anon_unexpected_allow");

  const normalEmail = `${runTag}-sd-normal@${fixtureDomain}`;
  const normalId = await ensureUser(service, normalEmail, password, { run: runTag });
  fixtureUserIds.push(normalId);
  trackRegistry(runRegistry, "authUserIds", normalId);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await authClient.auth.signInWithPassword({ email: normalEmail, password });
  if (login.error) throw new Error(`sd_normal_login_failed:${login.error.message}`);
  const authRpc = await authClient.rpc(probeFn, {});
  record("SD-auth-deny", "security_definer", "QRR RPC authenticated denied", "db-live", Boolean(authRpc.error), {
    error: authRpc.error?.message || null,
    classification: classifyPostgrestRpcError(authRpc.error, probeFn),
  });
  await authClient.auth.signOut();
  if (!authRpc.error) throw new Error("security_definer_auth_unexpected_allow");

  report.rlsAcl = {
    ...(report.rlsAcl || {}),
    securityDefiner: matrix.results.map((entry) => ({
      proname: entry.proname,
      ok: entry.ok,
      reason: entry.match?.reason || null,
    })),
  };

  return auditReport;
}
