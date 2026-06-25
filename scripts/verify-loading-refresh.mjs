#!/usr/bin/env node
/**
 * Theme + refresh stability checks (SSR).
 * Run while dev/prod server is up: BASE_URL=http://localhost:3000 node scripts/verify-loading-refresh.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const REFRESH_COUNT = 10;

async function fetchHtml(path, cookie = "") {
  const headers = cookie ? { Cookie: cookie } : {};
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const html = await res.text();
  return { status: res.status, html };
}

function extractDataTheme(html) {
  const match = html.match(/<html[^>]*\sdata-theme="(light|dark)"/);
  return match?.[1] ?? null;
}

function hasBootstrapShell(html) {
  return html.includes("bootstrapScreen") || html.includes("BootstrapLoading");
}

async function runThemeRefresh(theme, cookie) {
  const themes = [];
  let has404 = false;

  for (let i = 0; i < REFRESH_COUNT; i += 1) {
    const res = await fetchHtml("/", cookie);
    themes.push(extractDataTheme(res.html));
    if (res.status === 404) has404 = true;
  }

  return {
    theme,
    themes,
    stable: themes.every((value) => value === theme),
    has404,
  };
}

async function main() {
  console.log(`\nLoading refresh verification @ ${BASE} (${REFRESH_COUNT}x per theme)\n`);

  const dark = await runThemeRefresh("dark", "");
  const light = await runThemeRefresh("light", "hc_theme=light");

  let failed = false;

  for (const result of [dark, light]) {
    const icon = result.stable && !result.has404 ? "✓" : "✗";
    console.log(`  ${icon} ${result.theme} theme x${REFRESH_COUNT}: ${result.themes.join(" → ")}`);
    if (!result.stable || result.has404) failed = true;
  }

  const probe = await fetchHtml("/");
  console.log(
    `  ${probe.status === 200 ? "✓" : "✗"} homepage status=${probe.status} bootstrap-in-ssr=${hasBootstrapShell(probe.html)}`
  );
  if (probe.status !== 200) failed = true;

  console.log();
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
