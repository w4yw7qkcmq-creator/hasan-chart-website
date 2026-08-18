import { randomUUID } from "node:crypto";
import { getMarketDepthHub } from "../../../../lib/market-data/market-depth-hub";
import { getDynamicSymbolManager } from "../../../../lib/market-data/dynamic-symbol-manager";
import {
  ensureMarketDepthConsumer,
  releaseMarketDepthConsumer,
} from "../../../../lib/market-data/market-depth-lifecycle";
import {
  validateMarketDepthQuery,
  assertNoMockInProduction,
  ensureMarketSymbolsRegistry,
} from "../../../../lib/market-data/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const consumerReason = "api-market-depth-stream";

  try {
    assertNoMockInProduction();
    await ensureMarketSymbolsRegistry();
    await ensureMarketDepthConsumer(consumerReason);

    const validation = validateMarketDepthQuery(new URL(request.url).searchParams);
    if (!validation.valid) {
      releaseMarketDepthConsumer(consumerReason);
      return new Response(JSON.stringify({ success: false, error: validation.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const params = validation.params;
    const hub = getMarketDepthHub();
    const dynamicManager = getDynamicSymbolManager();
    const clientId = randomUUID();
    const acquireResult = dynamicManager.acquire(params.symbol, clientId);

    if (!acquireResult.ok) {
      releaseMarketDepthConsumer(consumerReason);
      return new Response(JSON.stringify({ success: false, error: acquireResult.error }), {
        status: acquireResult.error === "UNSUPPORTED_SYMBOL" || acquireResult.error === "INVALID_SYMBOL" ? 400 : 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    let unsubscribe = null;
    let heartbeatTimer = null;
    let abortHandler = null;
    let consumerReleased = false;

    const releaseConsumerOnce = () => {
      if (consumerReleased) return;
      consumerReleased = true;
      releaseMarketDepthConsumer(consumerReason);
    };

    const cleanup = (controller) => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (abortHandler) {
        request.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }

      dynamicManager.release(params.symbol, clientId);
      unsubscribe?.();
      unsubscribe = null;
      releaseConsumerOnce();

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

        dynamicManager.release(params.symbol, clientId);
        unsubscribe?.();
        unsubscribe = null;
        releaseConsumerOnce();
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
    releaseMarketDepthConsumer(consumerReason);
    return new Response(JSON.stringify({ success: false, error: error?.message || "STREAM_FAILED" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
