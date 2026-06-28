import {
  getMarketStreamHub,
  getSharedMarketPrices,
  startMarketStream,
} from "../../../lib/okx-market-stream";
import { getCachedMarketPulse } from "../../../lib/server-market-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hasKnownPrice(prices) {
  return Object.values(prices || {}).some((value) => value && value !== "0");
}

function snapshotToPayload(snapshot) {
  return {
    success: true,
    prices: snapshot.prices,
    status: snapshot.status,
    stale: Boolean(snapshot.stale),
    updatedAt: snapshot.updatedAt || null,
    source: snapshot.source || "shared-memory",
  };
}

function cachedPulseToPayload(cached) {
  return {
    success: true,
    prices: cached.prices,
    status: cached.stale ? "stale" : "live",
    stale: Boolean(cached.stale),
    updatedAt: cached.cachedAt || Date.now(),
    source: cached.source || "okx-rest-fallback",
  };
}

export async function GET(request) {
  startMarketStream("api-market-stream");
  const hub = getMarketStreamHub();
  const encoder = new TextEncoder();
  let unsubscribe = null;
  let heartbeatTimer = null;
  let abortHandler = null;

  const cleanup = (controller) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    if (abortHandler) {
      request.signal.removeEventListener("abort", abortHandler);
      abortHandler = null;
    }

    unsubscribe?.();
    unsubscribe = null;

    try {
      controller.close();
    } catch {
      // Stream already closed.
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      const pushPayload = (payload) => {
        if (request.signal.aborted || !payload?.prices) return;

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const pushSnapshot = (snapshot) => {
        pushPayload(snapshotToPayload(snapshot));
      };

      // Flush headers and open the SSE channel immediately.
      controller.enqueue(encoder.encode(": connected\n\n"));

      pushSnapshot(getSharedMarketPrices());

      unsubscribe = hub.subscribe((snapshot) => {
        pushSnapshot(snapshot);
      });

      if (!hasKnownPrice(hub.getSnapshot().prices)) {
        void getCachedMarketPulse()
          .then((cached) => {
            if (request.signal.aborted || !cached?.prices) return;
            pushPayload(cachedPulseToPayload(cached));
          })
          .catch(() => {
            // Hub updates or client polling will recover.
          });
      }

      heartbeatTimer = setInterval(() => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 25000);

      abortHandler = () => cleanup(controller);
      request.signal.addEventListener("abort", abortHandler, { once: true });
    },
    cancel() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (abortHandler) {
        request.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }

      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
