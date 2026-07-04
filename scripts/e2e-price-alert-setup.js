/**
 * Prepares a price alert that triggers immediately on the next worker check.
 * Outputs JSON with credentials and alert params for browser E2E.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchBtcPrice() {
  const response = await fetch(
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
  );
  const data = await response.json().catch(() => null);
  const price = Number(data?.data?.[0]?.last);
  if (!Number.isFinite(price)) {
    throw new Error("Failed to fetch BTC price");
  }
  return price;
}

async function main() {
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Missing Supabase env vars");
  }

  const stamp = Date.now();
  const email = `e2e-price-alert-${stamp}@example.com`;
  const password = "TestPass123!xx";

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "E2E Price Alert" },
  });

  if (createUserError) {
    throw new Error(`Create user failed: ${createUserError.message}`);
  }

  const { data: signInData, error: signInError } = await auth.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    throw new Error(`Sign in failed: ${signInError.message}`);
  }

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const loginBody = await loginRes.json().catch(() => ({}));
  const setCookie = loginRes.headers.getSetCookie?.() || [];

  const currentPrice = await fetchBtcPrice();
  const targetPrice = Math.floor(currentPrice * 0.995);
  const condition = "above";

  const output = {
    baseUrl: BASE,
    email,
    password,
    userId: signInData.user?.id || createdUser.user?.id || null,
    currentPrice,
    targetPrice,
    condition,
    coin: "BTCUSDT",
    loginOk: loginRes.ok,
    loginSuccess: loginBody.success ?? null,
    cookies: setCookie.map((c) => c.split(";")[0]),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("E2E_SETUP_FAILED", error.message);
  process.exit(1);
});
