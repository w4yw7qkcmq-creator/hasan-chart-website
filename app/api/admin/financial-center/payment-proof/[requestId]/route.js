import { requireAdminPermission } from "../../../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response.js";
import {
  buildInlineDataUrlPaymentProofResponse,
  buildInlinePaymentProofResponse,
  buildSignedUrlPaymentProofResponse,
  buildUrlPaymentProofResponse,
  classifyPaymentProof,
  INLINE_PAYMENT_PROOF_BINARY_MAX_BYTES,
} from "../../../../../../lib/admin-payment-proof-response.js";
import { requireValidSubscriptionRequestId } from "../../../../../../lib/id-validation.js";
import {
  createAdminPaymentProofSignedReadUrl,
  getPaymentProofForReview,
} from "../../../../../../lib/financial-center/payment-service.js";
import { sanitizeFinancialError } from "../../../../../../lib/financial-center/financial-center-shared.js";
import { PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS } from "../../../../../../lib/payment-proof-storage.js";

export const dynamic = "force-dynamic";

function logPaymentProofEvent(event, payload) {
  console.info(event, payload);
}

function trimIdForLog(value) {
  if (value == null) return "";
  return String(value).trim().slice(0, 80);
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const startedAt = Date.now();
  let requestId = "";
  let stage = "start";

  try {
    requestId = requireValidSubscriptionRequestId(resolvedParams?.requestId, "requestId");
  } catch {
    logPaymentProofEvent("PAYMENT_PROOF_FETCH_FAILED", {
      requestId: trimIdForLog(resolvedParams?.requestId),
      stage: "validation",
      durationMs: Date.now() - startedAt,
      statusCode: 400,
      error: "invalid-request-id",
    });
    return Response.json(
      { success: false, error: "معرّف طلب الاشتراك غير صالح" },
      { status: 400 }
    );
  }

  logPaymentProofEvent("PAYMENT_PROOF_FETCH_START", { requestId });

  try {
    stage = "auth";
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.FINANCE_PROOFS_READ, { request });
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

    stage = "db";
    const dbStartedAt = Date.now();
    const proofRow = await getPaymentProofForReview(adminCheck.supabase, requestId);
    const dbDurationMs = Date.now() - dbStartedAt;

    logPaymentProofEvent("PAYMENT_PROOF_DB_DONE", {
      requestId,
      durationMs: dbDurationMs,
      proofType: proofRow.source,
      proofBytes: proofRow.proofBytes || proofRow.sizeBytes || 0,
    });

    stage = "response";
    let response;

    if (proofRow.source === "storage") {
      const signedStartedAt = Date.now();
      const signed = await createAdminPaymentProofSignedReadUrl(proofRow.storagePath);
      logPaymentProofEvent("PAYMENT_PROOF_SIGNED_URL_READY", {
        requestId,
        durationMs: Date.now() - signedStartedAt,
        expiresIn: signed.expiresIn,
      });

      response = buildSignedUrlPaymentProofResponse({
        requestId,
        url: signed.signedUrl,
        mimeType: proofRow.mimeType,
        sizeBytes: proofRow.sizeBytes,
        expiresIn: signed.expiresIn || PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS,
      });
    } else {
      const proofMeta = classifyPaymentProof(proofRow.proof);
      const inlineBytes = proofRow.proofBytes || proofMeta.bytes || 0;

      if (proofMeta.type === "inline") {
        response =
          inlineBytes > INLINE_PAYMENT_PROOF_BINARY_MAX_BYTES
            ? buildInlineDataUrlPaymentProofResponse(proofRow.proof, { requestId })
            : buildInlinePaymentProofResponse(proofRow.proof, { requestId });
      } else {
        response = buildUrlPaymentProofResponse({
          requestId: proofRow.requestId,
          url: proofRow.proof,
        });
      }
    }

    logPaymentProofEvent("PAYMENT_PROOF_RESPONSE_READY", {
      requestId,
      durationMs: Date.now() - startedAt,
      proofType: proofRow.source === "storage" ? "signed-url" : proofRow.source,
      proofBytes: proofRow.proofBytes || proofRow.sizeBytes || 0,
      statusCode: response.status,
      responseType: proofRow.source === "storage" ? "json-signed-url" : "legacy",
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
