#!/usr/bin/env node
/**
 * Bootstrap verification — theme SSR + admin gate behavior.
 * Run while dev server is on http://localhost:3000
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function fetchHtml(path, cookie = "") {
  const headers = cookie ? { Cookie: cookie } : {};
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const html = await res.text();
  return { status: res.status, html, location: res.headers.get("location") };
}

function extractDataTheme(html) {
  const match = html.match(/<html[^>]*\sdata-theme="(light|dark)"/);
  return match?.[1] ?? null;
}

function hasThemeInitScript(html) {
  return /theme-init|hasan-chart-theme|localStorage\.getItem\(['"]hasan-chart-theme/.test(html);
}

async function testThemeSSR() {
  const results = [];

  const dark = await fetchHtml("/");
  results.push({
    name: "SSR default theme (no cookie)",
    pass: extractDataTheme(dark.html) === "dark",
    detail: `data-theme=${extractDataTheme(dark.html)}`,
  });

  const light = await fetchHtml("/", "hc_theme=light");
  results.push({
    name: "SSR theme from cookie (light)",
    pass: extractDataTheme(light.html) === "light",
    detail: `data-theme=${extractDataTheme(light.html)}`,
  });

  const noScript = await fetchHtml("/");
  results.push({
    name: "No theme-init-script in HTML",
    pass: !hasThemeInitScript(noScript.html),
    detail: hasThemeInitScript(noScript.html) ? "found legacy script" : "clean",
  });

  return results;
}

async function testAdminGate() {
  const results = [];

  const admin = await fetchHtml("/admin");
  const hasLoadingText = admin.html.includes("جاري التحقق من الجلسة");
  const has403Text = admin.html.includes("403 — غير مصرح");
  const redirectsLogin = admin.location?.includes("/login");

  results.push({
    name: "Admin SSR: no 403 flash in HTML",
    pass: !has403Text,
    detail: has403Text ? "403 text in SSR HTML" : "no 403 in SSR",
  });

  results.push({
    name: "Admin SSR: shows loading or client shell (not server redirect to login)",
    pass: admin.status === 200 || (admin.status >= 300 && admin.status < 400 && !redirectsLogin),
    detail: `status=${admin.status} location=${admin.location ?? "none"}`,
  });

  return results;
}

async function testThemePersistence() {
  const results = [];
  const jar = {};

  const setCookie = (res) => {
    const raw = res.headers.getSetCookie?.() || [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const [name, value] = pair.split("=");
      if (name && value) jar[name.trim()] = value.trim();
    }
  };

  const cookieHeader = () =>
    Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

  const setLight = await fetch(`${BASE}/api/theme`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: "light" }),
  });
  setCookie(setLight);

  const themes = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await fetchHtml("/", cookieHeader());
    themes.push(extractDataTheme(res.html));
  }

  results.push({
    name: "Theme persists across 3 refreshes (light)",
    pass: themes.every((t) => t === "light"),
    detail: themes.join(" → "),
  });

  return results;
}

async function main() {
  console.log(`\nBootstrap verification @ ${BASE}\n`);

  let allPass = true;

  for (const group of [testThemeSSR, testThemePersistence, testAdminGate]) {
    const results = await group();
    for (const r of results) {
      const icon = r.pass ? "✓" : "✗";
      console.log(`  ${icon} ${r.name}`);
      console.log(`      ${r.detail}`);
      if (!r.pass) allPass = false;
    }
    console.log();
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
