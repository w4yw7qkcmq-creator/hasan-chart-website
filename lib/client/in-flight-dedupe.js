/** Per-tab in-flight fetch dedupe — not shared between users or tabs. */

const inFlight = new Map();

export async function dedupeInFlightRequest(key, factory) {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function clearInFlightRequest(key) {
  inFlight.delete(key);
}

export function getInFlightRequestCount() {
  return inFlight.size;
}
