import { withRetry } from "../retry.mjs";

/** Safe auth gate — no real login. GET login page + guest admin 401. */
export async function runAuthGate(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const loginPage = await ctx.fetchRaw("/login");
    if (loginPage.status !== 200) throw Object.assign(new Error(`login page HTTP ${loginPage.status}`), { httpStatus: loginPage.status });

    const admin = await ctx.fetchJson("/api/admin/dashboard?section=overview");
    const latencyMs = Date.now() - t0;
    if (admin.res.status !== 401 && admin.res.status !== 403) {
      throw new Error(`security failure: admin API returned ${admin.res.status} for guest`);
    }
    return {
      status: "PASS",
      latencyMs,
      evidence: { loginPage: loginPage.status, adminGuest: admin.res.status },
      priority: null,
    };
  }, { label: "auth-gate" });
}
