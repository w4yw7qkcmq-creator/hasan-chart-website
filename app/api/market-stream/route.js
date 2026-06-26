import { getMarketStreamHub, startMarketStream } from "../../../lib/okx-market-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      const push = (snapshot) => {
        if (request.signal.aborted) return;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              success: true,
              prices: snapshot.prices,
              status: snapshot.status,
              stale: snapshot.stale,
              updatedAt: snapshot.updatedAt,
              source: snapshot.source,
            })}\n\n`
          )
        );
      };

      unsubscribe = hub.subscribe(push);

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
