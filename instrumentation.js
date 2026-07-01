export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMarketStream } = await import("./lib/okx-market-stream.js");
    startMarketStream("instrumentation-register");
  }
}
