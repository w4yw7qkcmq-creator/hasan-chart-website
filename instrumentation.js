export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  const { startPriceAlertsScheduler } = await import("./lib/price-alerts-runner.js");
  startPriceAlertsScheduler();
}
