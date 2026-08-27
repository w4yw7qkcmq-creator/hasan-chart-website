import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { getPublicSeoPage } from "../lib/public-seo-content/index.js";
import { loadE2eEnv } from "./e2e/env.mjs";
import { HttpClient } from "./e2e/http.mjs";

const P1_ROUTES = [
  "vip-forex",
  "vip-spot",
  "vip-futures",
  "subscriptions",
  "partner-center",
  "account-management",
];

async function fetchHtml(client, path) {
  const { res, text } = await client.json(path);
  return { status: res.status, html: text };
}

async function measureServerAuthProbe(client, path, iterations = 5) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await fetchHtml(client, path);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    minMs: Math.round(samples[0]),
    medianMs: Math.round(samples[Math.floor(samples.length / 2)]),
    maxMs: Math.round(samples[samples.length - 1]),
  };
}

async function main() {
  const env = loadE2eEnv();
  const client = new HttpClient(env.baseUrl);
  let failures = 0;

  if (!env.userEmail || !env.userPass) {
    console.error("SKIP: E2E_USER_EMAIL / E2E_USER_PASS required");
    process.exit(1);
  }

  await client.login(env.userEmail, env.userPass);

  const authResults = [];
  for (const pageKey of P1_ROUTES) {
    const page = getPublicSeoPage(pageKey);
    const { status, html } = await fetchHtml(client, page.path);
    const marketingHeroPresent = html.includes(page.heroTitle);
    const hasInitialAuthenticatedShell =
      pageKey === "subscriptions"
        ? html.includes("subscriptions-page") || html.includes("جاري تحميل الاشتراكات")
        : !marketingHeroPresent;

    authResults.push({
      path: page.path,
      status,
      marketingHeroPresent,
      hasInitialAuthenticatedShell,
    });

    try {
      assert.equal(status, 200, `${page.path} status`);
      assert.equal(
        marketingHeroPresent,
        false,
        `${page.path} must not SSR marketing hero for authenticated user`
      );
    } catch (error) {
      failures += 1;
      console.error(`FAIL auth ${page.path}:`, error.message);
    }
  }

  const timing = await measureServerAuthProbe(client, "/subscriptions");

  await client.logout();

  const guestResults = [];
  for (const pageKey of P1_ROUTES) {
    const page = getPublicSeoPage(pageKey);
    const { status, html } = await fetchHtml(client, page.path);

    guestResults.push({
      path: page.path,
      status,
      heroPresent: html.includes(page.heroTitle),
      vipForexLink: pageKey === "subscriptions" ? html.includes('href="/vip-forex"') : undefined,
    });

    try {
      assert.equal(status, 200, `${page.path} guest status`);
      assert.ok(html.includes(page.heroTitle), `${page.path} guest hero in HTML`);
      if (pageKey === "subscriptions") {
        assert.ok(html.includes('href="/vip-forex"'), "/subscriptions guest vip-forex link");
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL guest ${page.path}:`, error.message);
    }
  }

  console.log(
    JSON.stringify(
      {
        baseUrl: env.baseUrl,
        authResults,
        guestResults,
        serverAuthProbeTimingMs: timing,
        failures,
      },
      null,
      2
    )
  );

  if (failures > 0) {
    process.exit(1);
  }

  console.log(`SEO Phase 2C auth flash mitigation HTTP PASS (${P1_ROUTES.length} routes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
