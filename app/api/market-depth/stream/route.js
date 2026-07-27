import { getMarketDepthHub, startMarketDepth } from "../../../../lib/market-data/market-depth-hub";
import { validateMarketDepthQuery, assertNoMockInProduction } from "../../../../lib/market-data/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    assertNoMockInProduction();
    startMarketDepth("api-market-depth-stream");

    const validation = validateMarketDepthQuery(new URL(request.url).searchParams);
    if (!validation.valid) {
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const params = validation.params;
    const hub = getMarketDepthHub();
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
        // already closed
      }
    };

    const stream = new ReadableStream({
      start(controller) {
        const pushSnapshot = () => {
          if (request.signal.aborted) return;
          const payload = hub.getSnapshot(params);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ success: true, ...payload })}\n\n`)
          );
        };

        controller.enqueue(encoder.encode(": connected\n\n"));
        pushSnapshot();

        unsubscribe = hub.subscribe(() => {
          pushSnapshot();
        });

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
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error?.message || "STREAM_FAILED" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
