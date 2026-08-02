import {
  isValidMarketSymbolFormat,
  normalizeMarketSymbol,
} from "./market-data/symbols.js";

export const INSTANT_ANALYSIS_COOLDOWN_MS = 60 * 60 * 1000;

export function normalizeInstantAnalysisSymbol(input) {
  const normalized = normalizeMarketSymbol(input);

  if (!normalized || !isValidMarketSymbolFormat(normalized)) {
    return null;
  }

  return normalized;
}

export function computeInstantAnalysisAvailability(cooldownStartsAt, nowMs = Date.now()) {
  if (!cooldownStartsAt) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      nextAllowedAt: null,
    };
  }

  const startMs = new Date(cooldownStartsAt).getTime();

  if (!Number.isFinite(startMs)) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      nextAllowedAt: null,
    };
  }

  const nextAllowedMs = startMs + INSTANT_ANALYSIS_COOLDOWN_MS;
  const remainingMs = nextAllowedMs - nowMs;

  if (remainingMs <= 0) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      nextAllowedAt: null,
    };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    nextAllowedAt: new Date(nextAllowedMs).toISOString(),
  };
}

export function mapRpcAvailability(payload = {}) {
  const allowed = payload.allowed !== false;
  const retryAfterSeconds = Math.max(0, Number(payload.retry_after_seconds) || 0);
  const nextAllowedAtRaw = payload.next_allowed_at;

  let nextAllowedAt = null;

  if (typeof nextAllowedAtRaw === "string") {
    nextAllowedAt = nextAllowedAtRaw;
  } else if (nextAllowedAtRaw && typeof nextAllowedAtRaw === "object") {
    nextAllowedAt = String(nextAllowedAtRaw);
  }

  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
    nextAllowedAt: allowed ? null : nextAllowedAt,
  };
}

export function formatInstantAnalysisCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  if (minutes > 0) {
    return `${minutes} دقيقة و${seconds} ثانية`;
  }

  return `${seconds} ثانية`;
}

export function buildAvailabilityResponse(availability) {
  return {
    success: true,
    allowed: availability.allowed,
    retryAfterSeconds: availability.retryAfterSeconds,
    nextAllowedAt: availability.nextAllowedAt,
  };
}
