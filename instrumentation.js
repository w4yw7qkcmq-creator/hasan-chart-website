import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.js");

    const { announceWebsitePriceAlertEmailGuard } = await import(
      "./lib/price-alert-email-guard.js"
    );

    announceWebsitePriceAlertEmailGuard("instrumentation.js::register");

    const { recoverTelegramAlbumTimersOnStartup } = await import(
      "./lib/telegram-content/album-liveness-scheduler.js"
    );
    const { getSupabaseAdmin } = await import("./lib/auth-session.js");
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      recoverTelegramAlbumTimersOnStartup({ supabase: supabaseAdmin }).catch((error) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "telegram_content_startup_recovery_failed",
            message: error?.message || "unknown",
          })
        );
      });
    }

    const { startMarketStream } = await import("./lib/okx-market-stream.js");
    startMarketStream("instrumentation-register");

    const { warmupSymbolRegistry } = await import("./lib/market-data/symbol-registry.js");
    warmupSymbolRegistry("instrumentation-register");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config.js");
  }
}

export const onRequestError = Sentry.captureRequestError;
