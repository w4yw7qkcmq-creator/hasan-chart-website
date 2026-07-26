import { jsonRateLimited } from "./api-response";
import { RATE_LIMIT_ERROR } from "./rate-limit";

export { RATE_LIMIT_ERROR };

export async function enforceRateLimit(limiter, identifier) {
  const result = await limiter(identifier);

  if (!result?.success) {
    return jsonRateLimited();
  }

  return null;
}
