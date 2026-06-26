import { jsonRateLimited } from "./api-response";

export async function enforceRateLimit(limiter, identifier) {
  const result = await limiter(identifier);

  if (!result?.success) {
    return jsonRateLimited();
  }

  return null;
}
