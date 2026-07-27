export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { announceWebsitePriceAlertEmailGuard } = await import(
      "./lib/price-alert-email-guard.js"
    );

    announceWebsitePriceAlertEmailGuard("instrumentation.js::register");

    const { startMarketStream } = await import("./lib/okx-market-stream.js");
    startMarketStream("instrumentation-register");

    const { startMarketDepth } = await import("./lib/market-data/market-depth-hub.js");
    startMarketDepth("instrumentation-register");
  }
}
