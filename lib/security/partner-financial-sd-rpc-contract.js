/**
 * Partner financial SECURITY DEFINER RPC contract — harness/catalog audit only.
 */

export const PARTNER_FINANCIAL_SD_RPC_CONTRACT = [
  {
    proname: "credit_partner_qualified_referral_reward_atomic",
    schema: "public",
    requiredArgs: ["p_referral_id", "p_partner_id", "p_rule_id"],
    securityDefiner: true,
    requireSearchPath: true,
  },
  {
    proname: "create_partner_signup_bonus_atomic",
    schema: "public",
    requiredArgs: [
      "p_partner_id",
      "p_referral_id",
      "p_referred_user_id",
      "p_referral_code",
      "p_invited_username",
    ],
    securityDefiner: true,
    requireSearchPath: true,
  },
  {
    proname: "release_partner_signup_bonus_on_qualification",
    schema: "public",
    requiredArgs: ["p_referral_id", "p_partner_id"],
    securityDefiner: true,
    requireSearchPath: true,
  },
  {
    proname: "create_partner_commission_atomic",
    schema: "public",
    requiredArgs: [
      "p_partner_id",
      "p_referral_id",
      "p_referred_user_id",
      "p_service_type",
      "p_source_id",
      "p_base_amount",
      "p_commission_percent",
      "p_reason",
      "p_initial_status",
      "p_invited_username",
      "p_idempotency_key",
    ],
    securityDefiner: true,
    requireSearchPath: true,
  },
  {
    proname: "create_partner_growth_reward_atomic",
    schema: "public",
    requiredArgs: ["p_entitlement_id"],
    securityDefiner: true,
    requireSearchPath: true,
  },
];

export function normalizeIdentityArgs(identityArgs) {
  return String(identityArgs || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

export function classifyPostgrestRpcError(error, proname) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const hint = String(error?.hint || error?.details || "");
  const blob = `${message} ${hint}`.toLowerCase();
  const name = String(proname || "").toLowerCase();

  if (!error) {
    return { kind: "success", exists: true, missing: false, wrongSignature: false };
  }

  if (code === "PGRST202") {
    const hintedSignature =
      /perhaps you meant to call the function/i.test(blob) ||
      /\([a-z0-9_]+ (uuid|text|numeric)/i.test(hint);
    if (hintedSignature && blob.includes(name)) {
      return {
        kind: "wrong_signature_supplied",
        exists: true,
        missing: false,
        wrongSignature: true,
        zeroArgFalseNegative: true,
      };
    }
    return { kind: "missing", exists: false, missing: true, wrongSignature: false };
  }

  return { kind: "invokable", exists: true, missing: false, wrongSignature: false };
}

export function evaluateCatalogFunction(row, contract) {
  if (!row || !contract) {
    return { ok: false, reason: "missing_catalog_row" };
  }
  const args = normalizeIdentityArgs(row.identity_args);
  const missingArgs = (contract.requiredArgs || []).filter((arg) => !args.includes(arg));
  const searchPathOk = contract.requireSearchPath ? Boolean(row.search_path) : true;
  const prosecdefOk = contract.securityDefiner ? row.security_definer === true : true;
  const ok = missingArgs.length === 0 && searchPathOk && prosecdefOk;
  return {
    ok,
    reason: ok
      ? "ok"
      : missingArgs.length
        ? "signature_mismatch"
        : !prosecdefOk
          ? "prosecdef_false"
          : "search_path_missing",
    missingArgs,
    identityArgs: args,
    securityDefiner: row.security_definer === true,
    searchPath: row.search_path || null,
  };
}

export function evaluateSecurityDefinerMatrix(catalogRows, contracts = PARTNER_FINANCIAL_SD_RPC_CONTRACT) {
  const rowsByName = new Map();
  for (const row of catalogRows || []) {
    if (!rowsByName.has(row.proname)) rowsByName.set(row.proname, []);
    rowsByName.get(row.proname).push(row);
  }

  const results = [];
  let allOk = true;

  for (const contract of contracts) {
    const candidates = rowsByName.get(contract.proname) || [];
    const evaluated = candidates.map((row) => evaluateCatalogFunction(row, contract));
    const match = evaluated.find((entry) => entry.ok) || evaluated[0] || null;
    const ok = Boolean(match?.ok);
    if (!ok) allOk = false;
    results.push({
      proname: contract.proname,
      ok,
      contract,
      match,
      candidateCount: candidates.length,
    });
  }

  return { ok: allOk, results };
}

export function isZeroArgFalseNegative(error, proname) {
  return classifyPostgrestRpcError(error, proname).zeroArgFalseNegative === true;
}

export function resolveSecurityDefinerResidualGate({
  matrix,
  probeFn = "credit_partner_qualified_referral_reward_atomic",
  serviceRoleEmptyArgsError = null,
} = {}) {
  const matrixOk = matrix?.ok === true;
  const catalogEntry = (matrix?.results || []).find((entry) => entry.proname === probeFn);
  const catalogPass = Boolean(catalogEntry?.ok);
  const serviceRoleClassification = serviceRoleEmptyArgsError
    ? classifyPostgrestRpcError(serviceRoleEmptyArgsError, probeFn)
    : null;
  const zeroArgFalseNegativeClosed = matrixOk && catalogPass;
  return {
    catalogPass,
    matrixOk,
    zeroArgExecutionRequired: false,
    zeroArgFalseNegativeClosed,
    liveGatePass: zeroArgFalseNegativeClosed,
    catalogAuthoritative: catalogPass,
    serviceRoleWouldFalseNegative: serviceRoleClassification?.missing === true,
    serviceRoleClassification,
  };
}

export function buildSecurityDefinerAuditFlags(matrix) {
  const matrixOk = matrix?.ok === true;
  return {
    securityDefinerAuditMethod: "catalog",
    securityDefinerCatalogMatrixPass: matrixOk,
    securityDefinerZeroArgExecutionRequired: false,
    securityDefinerZeroArgFalseNegativeClosed: matrixOk,
  };
}
