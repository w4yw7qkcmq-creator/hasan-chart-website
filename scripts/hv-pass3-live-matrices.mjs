/**
 * Canonical bounded HTTP + Adaptive Login + Device/IP live matrices
 * Shared by Recovery and Pass3 orchestrators (staging harness only).
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  FIXTURE_DOMAIN,
  TURNSTILE_DUMMY_TOKEN,
  mergeCookies,
  ensureUser,
  applyStagingPartnerFeatureFlags,
} from "./hv-abuse-pass2-lib.mjs";
import { sectionDeviceIpFull } from "./hv-pass3-ext-sections.mjs";

export const HTTP_TIMEOUT_MS = 20000;

export function buildStagingHarnessDevEnv({ url, anonKey, serviceRoleKey, loginChallengeTtlMs = "2000" } = {}) {
  return applyStagingPartnerFeatureFlags({
    LOGIN_CHALLENGE_TTL_MS: loginChallengeTtlMs,
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    RATE_LIMIT_REDIS_TIMEOUT_MS: "8000",
    STAGING_SUPABASE_URL: url,
    STAGING_SUPABASE_ANON_KEY: anonKey,
    STAGING_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  });
}

export function applyStagingHarnessProcessEnv(devEnv = {}) {
  Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env), devEnv);
  if (devEnv.STAGING_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = devEnv.STAGING_SUPABASE_URL;
    process.env.STAGING_SUPABASE_URL = devEnv.STAGING_SUPABASE_URL;
  }
  if (devEnv.STAGING_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = devEnv.STAGING_SUPABASE_ANON_KEY;
  }
}

export function createHttpTelemetry(report = {}) {
  const telemetry = {
    traces: [],
    slowest: null,
    timeoutCount: 0,
    unexpected429: 0,
    unexpected5xx: 0,
  };

  function trackTrace(trace, { allow429Scenario = null } = {}) {
    telemetry.traces.push(trace);
    if (trace.timedOut) telemetry.timeoutCount += 1;
    if (trace.status === 429 && trace.scenarioId !== allow429Scenario) telemetry.unexpected429 += 1;
    if (trace.status >= 500) telemetry.unexpected5xx += 1;
    if (!telemetry.slowest || trace.elapsedMs > telemetry.slowest.elapsedMs) {
      telemetry.slowest = trace;
    }
    if (report) {
      report.httpTraces = telemetry.traces;
      report.unexpected429 = telemetry.unexpected429;
      report.unexpected5xx = telemetry.unexpected5xx;
      report.timeoutCount = telemetry.timeoutCount;
      report.slowestHttp = telemetry.slowest;
    }
  }

  async function httpJsonBounded(base, path, scenarioId, { method = "GET", body, headers = {}, cookies = "", timeoutMs = HTTP_TIMEOUT_MS } = {}) {
    const correlationId = crypto.randomBytes(8).toString("hex");
    const requestStartedAt = Date.now();
    let responseHeadersAt = null;
    let completedAt = null;
    let status = null;
    let json = {};
    let setCookie = [];
    let error = null;
    let timedOut = false;

    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-hv-correlation-id": correlationId,
          "x-hv-scenario-id": String(scenarioId || "unknown"),
          ...(cookies ? { Cookie: cookies } : {}),
          ...headers,
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      responseHeadersAt = Date.now();
      status = res.status;
      const text = await res.text();
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text.slice(0, 300) };
      }
      setCookie = res.headers.getSetCookie?.() || [];
      completedAt = Date.now();
    } catch (err) {
      completedAt = Date.now();
      error = String(err?.message || err);
      timedOut = /timeout|aborted/i.test(error);
      status = 0;
    }

    const pathname = (() => {
      try {
        return new URL(`${base}${path}`).pathname;
      } catch {
        return path;
      }
    })();

    const trace = {
      scenarioId: String(scenarioId || "unknown"),
      correlationId,
      method,
      pathname,
      requestStartedAt: new Date(requestStartedAt).toISOString(),
      responseHeadersAt: responseHeadersAt ? new Date(responseHeadersAt).toISOString() : null,
      completedAt: new Date(completedAt).toISOString(),
      elapsedMs: completedAt - requestStartedAt,
      status,
      code: json?.code || null,
      errorCode: json?.code || (timedOut ? "HTTP_TIMEOUT" : null),
      error: json?.error || (timedOut ? "timeout" : error),
      abortTimeoutMs: timeoutMs,
      timedOut,
    };

    trackTrace(trace, { allow429Scenario: "AL-11" });

    if (process.env.HV_HTTP_LOG === "1") {
      console.log(
        JSON.stringify({
          scenarioId: trace.scenarioId,
          method: trace.method,
          pathname: trace.pathname,
          status: trace.status,
          elapsedMs: trace.elapsedMs,
          correlationId: trace.correlationId,
          errorCode: trace.errorCode,
        })
      );
    }

    return { status, json, setCookie, trace, timedOut, headers: {} };
  }

  return { httpJsonBounded, telemetry, trackTrace };
}

function loginDenied(res) {
  return !(res.status === 200 && res.json?.success === true);
}

async function ensureLoginUser(service, email, password, runTag) {
  const uid = await ensureUser(service, email, password, { run: runTag, email_confirm: true });
  const { error: updErr } = await service.auth.admin.updateUserById(uid, { password, email_confirm: true });
  if (updErr) throw new Error(`password_reset_failed:${updErr.message}`);
  const anon = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`password_verify_failed:${signInErr.message}`);
  return uid;
}

/**
 * @param {object} opts
 * @param {string} opts.base
 * @param {object} opts.service
 * @param {string} opts.runTag
 * @param {string} opts.password
 * @param {string[]} opts.fixtureUserIds
 * @param {function} opts.record - (id, category, desc, type, ok, evidence) => void
 * @param {function} opts.httpJsonBounded
 * @param {object} [opts.report]
 */
export async function runAdaptiveLoginLiveMatrix({
  base,
  service,
  runTag,
  password,
  fixtureUserIds,
  record,
  httpJsonBounded,
  report,
}) {
  process.env.LOGIN_CHALLENGE_TTL_MS = process.env.LOGIN_CHALLENGE_TTL_MS || "2000";

  let ipSeq = 0;
  const nextIp = () => {
    ipSeq += 1;
    return `203.0.113.${(ipSeq % 200) + 10}`;
  };

  async function elevateChallenge(scenarioPrefix, email, pwd, riskIp, cookies = "") {
    for (let i = 0; i < 8; i += 1) {
      const bad = await httpJsonBounded(base, "/api/auth/login", `${scenarioPrefix}-warmup-${i}`, {
        method: "POST",
        body: { email, password: "wrong-pass" },
        headers: { "x-forwarded-for": riskIp },
        cookies,
      });
      cookies = mergeCookies(cookies, bad.setCookie);
      if (bad.timedOut) return { timedOut: true, cookies };
    }
    const challenged = await httpJsonBounded(base, "/api/auth/login", `${scenarioPrefix}-challenge`, {
      method: "POST",
      body: { email, password: pwd },
      headers: { "x-forwarded-for": riskIp },
      cookies,
    });
    cookies = mergeCookies(cookies, challenged.setCookie);
    return { challenged, cookies, timedOut: challenged.timedOut };
  }

  const email = `${runTag}-login@${FIXTURE_DOMAIN}`;
  const uid = await ensureLoginUser(service, email, password, runTag);
  fixtureUserIds.push(uid);

  const lowIp = nextIp();
  const low = await httpJsonBounded(base, "/api/auth/login", "AL-01", {
    method: "POST",
    body: { email, password },
    headers: { "x-forwarded-for": lowIp },
  });
  let cookies = mergeCookies("", low.setCookie);
  record("AL-01", "adaptive_login", "low-risk login succeeds", "http-live", low.status === 200 && low.json?.success === true, {
    status: low.status,
    code: low.json?.code,
    elapsedMs: low.trace.elapsedMs,
  });

  const riskIp = nextIp();
  const elevated = await elevateChallenge("AL-02", email, password, riskIp, cookies);
  if (elevated.timedOut) {
    if (report) report.timeoutRootCause = { layer: "elevateChallenge", scenario: "AL-02", note: "warmup/challenge HTTP timeout" };
    for (const [id, desc] of [
      ["AL-02", "elevated risk TURNSTILE_REQUIRED"],
      ["AL-03", "valid challenge + token success"],
      ["AL-04", "missing token denied"],
      ["AL-05", "invalid token denied"],
      ["AL-06", "challenge replay denied"],
      ["AL-07", "challenge email mismatch denied"],
      ["AL-08", "expired challenge denied"],
      ["AL-09", "direct POST bypass denied when challenged"],
      ["AL-10", "wrong credentials do not satisfy challenge"],
      ["AL-11", "rate limit does not mask adaptive challenge"],
      ["AL-12", "turnstile fail-closed on invalid"],
    ]) {
      record(id, "adaptive_login", desc, "http-live", false, { notExecuted: true, reason: "AL-02_setup_timeout" });
    }
    return { pass: 0, fail: 11, ok: false };
  }
  cookies = elevated.cookies;
  let challengeId = elevated.challenged.json?.challengeId;
  record(
    "AL-02",
    "adaptive_login",
    "elevated risk TURNSTILE_REQUIRED",
    "http-live",
    elevated.challenged.json?.code === "TURNSTILE_REQUIRED" && Boolean(challengeId),
    { challengeId: Boolean(challengeId), elapsedMs: elevated.challenged.trace.elapsedMs }
  );
  if (!challengeId) {
    for (const [id, desc] of [
      ["AL-03", "valid challenge + token success"],
      ["AL-04", "missing token denied"],
      ["AL-05", "invalid token denied"],
      ["AL-06", "challenge replay denied"],
      ["AL-07", "challenge email mismatch denied"],
      ["AL-08", "expired challenge denied"],
      ["AL-09", "direct POST bypass denied when challenged"],
      ["AL-10", "wrong credentials do not satisfy challenge"],
      ["AL-11", "rate limit does not mask adaptive challenge"],
      ["AL-12", "turnstile fail-closed on invalid"],
    ]) {
      record(id, "adaptive_login", desc, "http-live", false, { notExecuted: true, reason: "no_challenge_id" });
    }
    return { pass: 1, fail: 11, ok: false };
  }

  const missing = await httpJsonBounded(base, "/api/auth/login", "AL-04", {
    method: "POST",
    body: { email, password },
    headers: { "x-forwarded-for": riskIp },
    cookies,
  });
  record("AL-04", "adaptive_login", "missing token denied", "http-live", loginDenied(missing), {
    status: missing.status,
    code: missing.json?.code,
  });

  const al03Ip = nextIp();
  const al03Setup = await elevateChallenge("AL-03-setup", email, password, al03Ip, "");
  const al03ChallengeId = al03Setup.challenged.json?.challengeId;
  if (globalThis.__turnstileUsedTokens) globalThis.__turnstileUsedTokens.clear();
  const ok = await httpJsonBounded(base, "/api/auth/login", "AL-03", {
    method: "POST",
    body: { email, password, challengeId: al03ChallengeId, turnstileToken: TURNSTILE_DUMMY_TOKEN },
    headers: { "x-forwarded-for": al03Ip },
    cookies: al03Setup.cookies,
  });
  cookies = mergeCookies(cookies, ok.setCookie);
  const al03ChallengeIdForReplay = al03ChallengeId;
  record("AL-03", "adaptive_login", "valid challenge + token success", "http-live", ok.status === 200 && ok.json?.success === true, {
    status: ok.status,
    code: ok.json?.code,
    elapsedMs: ok.trace.elapsedMs,
    hasChallengeId: Boolean(al03ChallengeId),
  });

  const bypassIp = nextIp();
  const bypassElevated = await elevateChallenge("AL-09", email, password, bypassIp, "");
  const bypassMissing = bypassElevated.challenged;
  record(
    "AL-09",
    "adaptive_login",
    "direct POST bypass denied when challenged",
    "http-live",
    loginDenied(bypassMissing) && bypassMissing.json?.code === "TURNSTILE_REQUIRED",
    { status: bypassMissing.status, code: bypassMissing.json?.code }
  );

  const invalidIp = nextIp();
  const invalidElevated = await elevateChallenge("AL-05", email, password, invalidIp, "");
  const invalidChallengeId = invalidElevated.challenged.json?.challengeId;
  const invalid = await httpJsonBounded(base, "/api/auth/login", "AL-05", {
    method: "POST",
    body: { email, password, challengeId: invalidChallengeId, turnstileToken: "bad-token" },
    headers: { "x-forwarded-for": invalidIp },
    cookies: invalidElevated.cookies,
  });
  record("AL-05", "adaptive_login", "invalid token denied", "http-live", loginDenied(invalid) && Boolean(invalidChallengeId), {
    status: invalid.status,
    code: invalid.json?.code,
  });
  record("AL-12", "adaptive_login", "turnstile fail-closed on invalid", "http-live", loginDenied(invalid) && Boolean(invalidChallengeId), {
    status: invalid.status,
    code: invalid.json?.code,
  });

  const otherEmail = `${runTag}-other@${FIXTURE_DOMAIN}`;
  const otherUid = await ensureLoginUser(service, otherEmail, password, runTag);
  fixtureUserIds.push(otherUid);
  const otherIp = nextIp();
  const otherElevated = await elevateChallenge("AL-07", otherEmail, password, otherIp, "");
  const otherChallengeId = otherElevated.challenged.json?.challengeId;
  const cross = await httpJsonBounded(base, "/api/auth/login", "AL-07", {
    method: "POST",
    body: { email, password, challengeId: otherChallengeId, turnstileToken: TURNSTILE_DUMMY_TOKEN },
    headers: { "x-forwarded-for": otherIp },
    cookies: otherElevated.cookies,
  });
  record("AL-07", "adaptive_login", "challenge email mismatch denied", "http-live", loginDenied(cross), {
    status: cross.status,
    code: cross.json?.code,
  });

  if (globalThis.__turnstileUsedTokens) globalThis.__turnstileUsedTokens.clear();
  const replay = await httpJsonBounded(base, "/api/auth/login", "AL-06", {
    method: "POST",
    body: { email, password, challengeId: al03ChallengeIdForReplay, turnstileToken: TURNSTILE_DUMMY_TOKEN },
    headers: { "x-forwarded-for": al03Ip },
    cookies: al03Setup.cookies,
  });
  record(
    "AL-06",
    "adaptive_login",
    "challenge replay denied",
    "http-live",
    loginDenied(replay) && (replay.json?.code === "CHALLENGE_REPLAY" || replay.status === 403),
    { status: replay.status, code: replay.json?.code }
  );

  const expEmail = `${runTag}-exp@${FIXTURE_DOMAIN}`;
  const expUid = await ensureLoginUser(service, expEmail, password, runTag);
  fixtureUserIds.push(expUid);
  const expIp = nextIp();
  const expElevated = await elevateChallenge("AL-08", expEmail, password, expIp, "");
  const expChallengeId = expElevated.challenged.json?.challengeId;
  if (expChallengeId) {
    await new Promise((r) => setTimeout(r, 2500));
    if (globalThis.__turnstileUsedTokens) globalThis.__turnstileUsedTokens.clear();
    const expHttp = await httpJsonBounded(base, "/api/auth/login", "AL-08", {
      method: "POST",
      body: { email: expEmail, password, challengeId: expChallengeId, turnstileToken: TURNSTILE_DUMMY_TOKEN },
      headers: { "x-forwarded-for": expIp },
      cookies: expElevated.cookies,
    });
    record("AL-08", "adaptive_login", "expired challenge denied", "http-live", loginDenied(expHttp), {
      status: expHttp.status,
      code: expHttp.json?.code,
    });
  } else {
    record("AL-08", "adaptive_login", "expired challenge denied", "http-live", false, { reason: "no_challenge_id" });
  }

  const al10Ip = nextIp();
  const al10Setup = await elevateChallenge("AL-10-setup", email, password, al10Ip, "");
  const al10ChallengeId = al10Setup.challenged.json?.challengeId;
  if (globalThis.__turnstileUsedTokens) globalThis.__turnstileUsedTokens.clear();
  const wrong = await httpJsonBounded(base, "/api/auth/login", "AL-10", {
    method: "POST",
    body: { email, password: "wrong-pass", challengeId: al10ChallengeId, turnstileToken: TURNSTILE_DUMMY_TOKEN },
    headers: { "x-forwarded-for": al10Ip },
    cookies: al10Setup.cookies,
  });
  record("AL-10", "adaptive_login", "wrong credentials do not satisfy challenge", "http-live", loginDenied(wrong), {
    status: wrong.status,
  });

  const rateEmail = `${runTag}-rate@${FIXTURE_DOMAIN}`;
  const rateUid = await ensureLoginUser(service, rateEmail, password, runTag);
  fixtureUserIds.push(rateUid);
  const rateIp = nextIp();
  for (let i = 0; i < 12; i += 1) {
    await httpJsonBounded(base, "/api/auth/login", `AL-11-warmup-${i}`, {
      method: "POST",
      body: { email: rateEmail, password: "wrong-pass" },
      headers: { "x-forwarded-for": rateIp },
    });
  }
  const rateProbe = await httpJsonBounded(base, "/api/auth/login", "AL-11-probe", {
    method: "POST",
    body: { email: rateEmail, password: "wrong-pass" },
    headers: { "x-forwarded-for": rateIp },
  });
  const rateChallenge = await httpJsonBounded(base, "/api/auth/login", "AL-11", {
    method: "POST",
    body: { email: rateEmail, password },
    headers: { "x-forwarded-for": rateIp },
  });
  record(
    "AL-11",
    "adaptive_login",
    "rate limit does not mask adaptive challenge",
    "http-live",
    rateChallenge.json?.code === "TURNSTILE_REQUIRED" ||
      rateChallenge.status === 403 ||
      (rateProbe.status === 429 && rateChallenge.json?.code === "TURNSTILE_REQUIRED"),
    { rateProbe: rateProbe.status, rateChallenge: rateChallenge.status, code: rateChallenge.json?.code }
  );

  const scenarios = [];
  let pass = 0;
  let fail = 0;
  for (const id of ["AL-01", "AL-02", "AL-03", "AL-04", "AL-05", "AL-06", "AL-07", "AL-08", "AL-09", "AL-10", "AL-11", "AL-12"]) {
    const row = report?.manifest?.scenarios?.find((s) => s.id === id);
    if (row?.result === "PASS") pass += 1;
    else if (row?.result === "FAIL") fail += 1;
    scenarios.push({ id, result: row?.result || "UNKNOWN" });
  }

  return { pass, fail, ok: fail === 0 && pass === 12, scenarios };
}

/** Device/IP matrix — delegates to sectionDeviceIpFull with bounded HTTP in ctx. */
export async function runDeviceIpLiveMatrix({ base, service, ctx, recordDevice }) {
  const deviceCtx = {
    ...ctx,
    record(id, _cat, _desc, _type, ok, evidence = {}) {
      if (recordDevice) recordDevice(id, ok, evidence);
      else if (ctx.record) ctx.record(id, "device_ip", _desc, "http-live", ok, evidence);
    },
  };
  await sectionDeviceIpFull(base, service, deviceCtx);
}

export function summarizeManifestCounts(report) {
  const scenarios = report?.manifest?.scenarios || [];
  const executed = scenarios.filter((s) => s.result !== "NOT_EXECUTED").length;
  const pass = scenarios.filter((s) => s.result === "PASS").length;
  const fail = scenarios.filter((s) => s.result === "FAIL").length;
  const notExecuted = scenarios.filter((s) => s.result === "NOT_EXECUTED").length;
  return { executed, pass, fail, notExecuted };
}

/** Re-audit legacy hv-pass3 auth users tied to append-only financial history. */
export async function auditHistoricalTestIdentities(service) {
  const identities = [];
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const users = (list?.users || []).filter((u) => u.email?.includes("hv-pass3-"));
  for (const user of users) {
    const uid = user.id;
    const [{ data: profile }, { data: partner }] = await Promise.all([
      service.from("profiles").select("id, email, human_verification_status").eq("id", uid).maybeSingle(),
      service.from("partners").select("id, status, balance_pending, balance_withdrawable").eq("user_id", uid).maybeSingle(),
    ]);
    const { count: entCount } = partner?.id
      ? await service
          .from("partner_reward_entitlements")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partner.id)
      : { count: 0 };
    const { count: pendingRewards } = partner?.id
      ? await service
          .from("partner_reward_entitlements")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partner.id)
          .in("status", ["pending", "risk_hold"])
      : { count: 0 };
    const hasFinancialRef =
      Boolean(partner?.id) &&
      (Number(partner.balance_pending || 0) !== 0 ||
        Number(partner.balance_withdrawable || 0) !== 0 ||
        (entCount || 0) > 0);
    identities.push({
      email: user.email,
      userId: uid,
      hasActiveProfile: Boolean(profile),
      partnerId: partner?.id || null,
      pendingRewards: pendingRewards || 0,
      hasFinancialReference: hasFinancialRef,
      classification: hasFinancialRef ? "HISTORICAL_TEST_IDENTITY_REFERENCE" : "INACTIVE_FIXTURE",
      excludedFromActiveFixtureGate: true,
    });
  }
  return identities;
}
