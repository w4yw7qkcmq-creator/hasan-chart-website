const PRODUCTION_LOG_EVENTS = new Set([
  "error",
  "reconnecting",
  "sequence_gap",
  "stale",
  "recovered",
]);

export function shouldLogMarketDepthEvent(event) {
  if (process.env.NODE_ENV !== "production") return true;
  return PRODUCTION_LOG_EVENTS.has(event);
}

export function logMarketDepth(event, details = {}) {
  if (!shouldLogMarketDepthEvent(event)) return;

  console.log(`marketDepth: ${event}`, {
    timestamp: new Date().toISOString(),
    ...details,
  });
}
