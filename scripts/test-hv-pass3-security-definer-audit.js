#!/usr/bin/env node
/**
 * Unit tests — Pass3 SECURITY DEFINER audit harness (no live DB).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_FINANCIAL_SD_RPC_CONTRACT,
  classifyPostgrestRpcError,
  evaluateCatalogFunction,
  evaluateSecurityDefinerMatrix,
  isZeroArgFalseNegative,
  resolveSecurityDefinerResidualGate,
  buildSecurityDefinerAuditFlags,
} from "../lib/security/partner-financial-sd-rpc-contract.js";

function buildPassMatrix() {
  const rows = PARTNER_FINANCIAL_SD_RPC_CONTRACT.map((contract) => ({
    proname: contract.proname,
    security_definer: true,
    identity_args: contract.requiredArgs.map((arg) => `${arg} uuid`).join(", "),
    search_path: "public, pg_temp",
  }));
  return evaluateSecurityDefinerMatrix(rows);
}

describe("hv-pass3 security definer audit harness", () => {
  it("multi-arg RPC + catalog PASS => no zero-arg fatal gate", () => {
    const matrix = buildPassMatrix();
    const residual = resolveSecurityDefinerResidualGate({ matrix });
    assert.equal(residual.liveGatePass, true);
    assert.equal(residual.zeroArgExecutionRequired, false);
  });

  it("service-role PGRST202 from empty args does NOT override catalog PASS", () => {
    const matrix = buildPassMatrix();
    const serviceError = {
      code: "PGRST202",
      message:
        "Could not find the function public.credit_partner_qualified_referral_reward_atomic without parameters in the schema cache",
      hint: null,
    };
    const residual = resolveSecurityDefinerResidualGate({ matrix, serviceRoleEmptyArgsError: serviceError });
    assert.equal(residual.catalogPass, true);
    assert.equal(residual.serviceRoleWouldFalseNegative, true);
    assert.equal(residual.liveGatePass, true);
    assert.equal(residual.zeroArgFalseNegativeClosed, true);
  });

  it("truly missing RPC still FAILS as missing", () => {
    const error = {
      code: "PGRST202",
      message: "Could not find the function public.definitely_missing_rpc without parameters in the schema cache",
      hint: null,
    };
    const cls = classifyPostgrestRpcError(error, "definitely_missing_rpc");
    assert.equal(cls.missing, true);
    assert.equal(cls.exists, false);
    const matrix = evaluateSecurityDefinerMatrix([]);
    assert.equal(matrix.ok, false);
  });

  it("wrong signature is distinguished from missing function", () => {
    const contract = PARTNER_FINANCIAL_SD_RPC_CONTRACT.find(
      (c) => c.proname === "create_partner_growth_reward_atomic"
    );
    const row = {
      proname: "create_partner_growth_reward_atomic",
      security_definer: true,
      identity_args: "p_wrong_id uuid",
      search_path: "public, pg_temp",
    };
    const evalResult = evaluateCatalogFunction(row, contract);
    assert.equal(evalResult.ok, false);
    assert.equal(evalResult.reason, "signature_mismatch");
  });

  it("prosecdef=false fails", () => {
    const contract = PARTNER_FINANCIAL_SD_RPC_CONTRACT.find(
      (c) => c.proname === "create_partner_growth_reward_atomic"
    );
    const row = {
      proname: "create_partner_growth_reward_atomic",
      security_definer: false,
      identity_args: "p_entitlement_id uuid",
      search_path: "public, pg_temp",
    };
    const evalResult = evaluateCatalogFunction(row, contract);
    assert.equal(evalResult.ok, false);
    assert.equal(evalResult.reason, "prosecdef_false");
  });

  it("correct signature/prosecdef passes matrix evaluation", () => {
    const matrix = buildPassMatrix();
    assert.equal(matrix.ok, true);
    assert.equal(matrix.results.every((entry) => entry.ok), true);
  });

  it("no financial RPC execution is required to prove existence", () => {
    const matrix = buildPassMatrix();
    const flags = buildSecurityDefinerAuditFlags(matrix);
    assert.equal(flags.securityDefinerAuditMethod, "catalog");
    assert.equal(flags.securityDefinerCatalogMatrixPass, true);
    assert.equal(flags.securityDefinerZeroArgExecutionRequired, false);
    assert.equal(flags.securityDefinerZeroArgFalseNegativeClosed, true);
  });

  it("classifier does not mutate DB and zero-arg hint still classifies correctly", () => {
    const error = {
      code: "PGRST202",
      message:
        "Could not find the function public.credit_partner_qualified_referral_reward_atomic without parameters in the schema cache",
      hint:
        "Perhaps you meant to call the function public.credit_partner_qualified_referral_reward_atomic(p_referral_id uuid, p_partner_id uuid, p_rule_id uuid)",
    };
    const cls = classifyPostgrestRpcError(error, "credit_partner_qualified_referral_reward_atomic");
    assert.equal(cls.missing, false);
    assert.equal(cls.exists, true);
    assert.equal(isZeroArgFalseNegative(error, "credit_partner_qualified_referral_reward_atomic"), true);
    assert.equal(typeof classifyPostgrestRpcError, "function");
  });
});
