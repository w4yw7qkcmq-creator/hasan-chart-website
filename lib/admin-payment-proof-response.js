const CACHE_NO_STORE = "private, no-store, no-cache, must-revalidate";

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s;

function isInlinePaymentProof(proof) {
  return String(proof || "").startsWith("data:image");
}

export function classifyPaymentProof(proof) {
  const value = String(proof || "").trim();
  if (!value) return { type: "empty", bytes: 0 };
  if (isInlinePaymentProof(value)) return { type: "inline", value, bytes: value.length };
  if (/^https?:\/\//i.test(value)) return { type: "url", value, bytes: value.length };
  return { type: "storage_or_path", value, bytes: value.length };
}

export function decodeInlinePaymentProof(proof) {
  const value = String(proof || "").trim();
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) {
    const error = new Error("صيغة إثبات الدفع غير مدعومة");
    error.status = 422;
    throw error;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { mimeType, buffer };
}

export function buildInlinePaymentProofResponse(proof, { requestId = "" } = {}) {
  const { mimeType, buffer } = decodeInlinePaymentProof(proof);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=300",
      "X-Payment-Proof-Request-Id": String(requestId || ""),
      "X-Payment-Proof-Type": "inline-binary",
      "X-Payment-Proof-Bytes": String(buffer.length),
      Vary: "Accept-Encoding",
    },
  });
}

export function buildUrlPaymentProofResponse({ requestId, url }) {
  return Response.json(
    {
      success: true,
      proofType: "url",
      url,
      requestId,
    },
    {
      headers: {
        "Cache-Control": CACHE_NO_STORE,
        "X-Payment-Proof-Type": "url",
        Vary: "Accept-Encoding",
      },
    }
  );
}
