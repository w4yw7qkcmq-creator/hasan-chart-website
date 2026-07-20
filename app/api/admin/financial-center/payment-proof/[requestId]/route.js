import { verifyFinanceCenterAccess } from "../../../../../../lib/financial-center/financial-center-auth.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response.js";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit.js";
import { adminReadLimiter } from "../../../../../../lib/rate-limit.js";
import { getPaymentProofForReview } from "../../../../../../lib/financial-center/payment-service.js";
import { sanitizeFinancialError } from "../../../../../../lib/financial-center/financial-center-shared.js";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const access = await verifyFinanceCenterAccess();
    if (!access.ok) {
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(access.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const requestId = String(params?.requestId || "").trim();
    if (!requestId) {
      return Response.json({ success: false, error: "معرّف الطلب مطلوب" }, { status: 400 });
    }

    const proof = await getPaymentProofForReview(access.supabase, requestId);

    return Response.json(
      {
        success: true,
        proof: {
          requestId: proof.requestId,
          userEmail: proof.userEmail,
          planName: proof.planName,
          proof: proof.proof,
          isInline: proof.isInline,
        },
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
          Vary: "Accept-Encoding",
        },
      }
    );
  } catch (error) {
    console.error("Financial payment proof API error:", error?.message || error);
    return Response.json(
      {
        success: false,
        error: sanitizeFinancialError(error),
      },
      { status: error?.status || 500 }
    );
  }
}
