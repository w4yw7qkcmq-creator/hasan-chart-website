import { verifyAdminSession } from "../../../../../../lib/admin-auth.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response.js";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit.js";
import { adminReadLimiter } from "../../../../../../lib/rate-limit.js";
import {
  buildInlinePaymentProofResponse,
  buildUrlPaymentProofResponse,
  classifyPaymentProof,
} from "../../../../../../lib/admin-payment-proof-response.js";
import { getPaymentProofForReview } from "../../../../../../lib/financial-center/payment-service.js";
import { sanitizeFinancialError } from "../../../../../../lib/financial-center/financial-center-shared.js";

export const dynamic = "force-dynamic";

function logPaymentProofEvent(event, payload) {
  console.info(event, payload);
}

export async function GET(_request, { params }) {
  const startedAt = Date.now();
  const resolvedParams = await params;
  const requestId = String(resolvedParams?.requestId || "").trim();
  let stage = "start";

  logPaymentProofEvent("PAYMENT_PROOF_FETCH_START", { requestId });

  try {
    stage = "auth";
    const adminCheck = await verifyAdminSession();
    if (!adminCheck.ok) {
      logPaymentProofEvent("PAYMENT_PROOF_FETCH_FAILED", {
        requestId,
        stage,
        durationMs: Date.now() - startedAt,
        statusCode: adminCheck.status,
        error: adminCheck.error,
      });
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) {
      logPaymentProofEvent("PAYMENT_PROOF_FETCH_FAILED", {
        requestId,
        stage: "rate-limit",
        durationMs: Date.now() - startedAt,
        statusCode: 429,
        error: "rate-limited",
      });
      return rateLimited;
    }

    if (!requestId) {
      logPaymentProofEvent("PAYMENT_PROOF_FETCH_FAILED", {
        requestId,
        stage: "validation",
        durationMs: Date.now() - startedAt,
        statusCode: 400,
        error: "missing-request-id",
      });
      return Response.json({ success: false, error: "معرّف الطلب مطلوب" }, { status: 400 });
    }

    stage = "db";
    const dbStartedAt = Date.now();
    const proofRow = await getPaymentProofForReview(adminCheck.supabase, requestId);
    const dbDurationMs = Date.now() - dbStartedAt;
    const proofMeta = classifyPaymentProof(proofRow.proof);

    logPaymentProofEvent("PAYMENT_PROOF_DB_DONE", {
      requestId,
      durationMs: dbDurationMs,
      proofType: proofMeta.type,
      proofBytes: proofMeta.type === "inline" ? proofRow.proofBytes || proofMeta.bytes : proofMeta.bytes,
    });

    stage = "response";
    let response;

    if (proofMeta.type === "inline") {
      response = buildInlinePaymentProofResponse(proofRow.proof, { requestId });
    } else {
      response = buildUrlPaymentProofResponse({
        requestId: proofRow.requestId,
        url: proofRow.proof,
      });
    }

    logPaymentProofEvent("PAYMENT_PROOF_RESPONSE_READY", {
      requestId,
      durationMs: Date.now() - startedAt,
      proofType: proofMeta.type,
      proofBytes:
        proofMeta.type === "inline"
          ? Number(response.headers.get("X-Payment-Proof-Bytes") || proofRow.proofBytes || 0)
          : proofMeta.bytes,
      statusCode: response.status,
      responseType: proofMeta.type === "inline" ? "binary" : "json-url",
    });

    return response;
  } catch (error) {
    console.error("PAYMENT_PROOF_FETCH_FAILED", {
      requestId,
      stage,
      durationMs: Date.now() - startedAt,
      statusCode: error?.status || 500,
      error: error?.message || String(error),
      supabaseCode: error?.code || null,
      stack: error?.stack,
    });

    return Response.json(
      {
        success: false,
        error: sanitizeFinancialError(error),
      },
      {
        status: error?.status || 500,
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  }
}
