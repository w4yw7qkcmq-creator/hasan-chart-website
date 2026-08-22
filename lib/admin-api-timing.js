export function createApiTimer(routeName) {
  const startedAt = Date.now();
  const marks = [];

  return {
    mark(label) {
      marks.push({ label, ms: Date.now() - startedAt });
    },
    finish(extra = {}) {
      const totalMs = Date.now() - startedAt;
      if (process.env.ADMIN_API_TIMING === "1" || totalMs >= 2000) {
        console.info(
          "ADMIN_API_TIMING",
          JSON.stringify({
            route: routeName,
            totalMs,
            marks,
            ...extra,
          })
        );
      }
      return totalMs;
    },
  };
}
