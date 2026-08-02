#!/usr/bin/env node

import {
  buildAnalysisRequestBody,
  buildLoadingMessage,
  resolveResultExecutionTimeframe,
  shouldStartAnalysisRequest,
  validateAnalysisRequest,
} from "../lib/instant-analysis-request.js";
import { labelResultTimeframe } from "../lib/instant-analysis-labels.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  EXECUTION_TIMEFRAME_OPTIONS,
  resolveExecutionTimeframeInput,
  getExecutionTimeframeConfig,
} = require("../worker/lib/instant-analysis-v2/constants.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createUiRequestSimulator(initial = {}) {
  let symbol = initial.symbol ?? "";
  let timeframe = initial.timeframe ?? "15m";
  let loading = false;
  let result = null;
  let requestSnapshot = null;
  let error = "";
  let postCount = 0;
  let lastPostBody = null;
  let availability = { allowed: true, retryAfterSeconds: 0 };
  let countdownApplied = false;

  const applyAvailabilityPayload = (payload) => {
    if (!payload || payload.success !== true) return;
    const allowed = payload.allowed !== false;
    availability = {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(0, Number(payload.retryAfterSeconds) || 0),
    };
    if (!allowed) {
      countdownApplied = true;
    }
  };

  const submit = () => {
    if (!shouldStartAnalysisRequest({ loading, availabilityAllowed: availability.allowed })) {
      return { submitted: false, reason: "blocked" };
    }

    const validation = validateAnalysisRequest({ symbol, timeframe });
    if (!validation.ok) {
      error = validation.message;
      return { submitted: false, reason: validation.code, message: validation.message };
    }

    requestSnapshot = {
      symbol: validation.symbol,
      timeframe: validation.timeframe,
    };
    loading = true;
    error = "";
    result = null;

    const body = buildAnalysisRequestBody({
      symbol: requestSnapshot.symbol,
      timeframe: requestSnapshot.timeframe,
    });
    postCount += 1;
    lastPostBody = body;

    return {
      submitted: true,
      body,
      loadingMessage: buildLoadingMessage(requestSnapshot),
      snapshot: { ...requestSnapshot },
    };
  };

  const acceptServerResponse = (responseBody) => {
    applyAvailabilityPayload({
      success: true,
      allowed: false,
      retryAfterSeconds: 3600,
      nextAllowedAt: new Date(Date.now() + 3600000).toISOString(),
    });
    result = {
      version: "2.0",
      v2: {
        symbol: responseBody.symbol,
        meta: { executionTimeframe: responseBody.executionTimeframe, uiVersion: "3.0" },
      },
    };
    loading = false;
    requestSnapshot = null;
  };

  return {
    setSymbol(value) {
      symbol = value;
    },
    setTimeframe(value) {
      timeframe = value;
    },
    submit,
    acceptServerResponse,
    get state() {
      return {
        symbol,
        timeframe,
        loading,
        result,
        requestSnapshot,
        error,
        postCount,
        lastPostBody,
        availability,
        countdownApplied,
      };
    },
    displayedResultTimeframe() {
      return labelResultTimeframe(result?.v2 || result);
    },
  };
}

// 1. BTCUSDT + 1H → Worker receives 1h
{
  const body = buildAnalysisRequestBody({ symbol: "BTCUSDT", timeframe: "1h" });
  assert(body.symbol === "BTCUSDT", "BTCUSDT symbol in request body");
  assert(body.executionTimeframe === "1h", "Worker receives 1h for BTCUSDT");
}

// 2. ETHUSDT + 4H → Worker receives both
{
  const body = buildAnalysisRequestBody({ symbol: "ethusdt", timeframe: "4H" });
  assert(body.symbol === "ETHUSDT", "ETHUSDT normalized");
  assert(body.executionTimeframe === "4h", "Worker receives 4h for ETHUSDT");
}

// 3. Change timeframe without button → no POST
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "15m" });
  ui.setTimeframe("1h");
  assert(ui.state.postCount === 0, "Changing timeframe alone must not POST");
}

// 4. Change symbol without button → no POST
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "1h" });
  ui.setSymbol("ETHUSDT");
  assert(ui.state.postCount === 0, "Changing symbol alone must not POST");
}

// 5. Result stays on original timeframe after selector change
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "1h" });
  const submission = ui.submit();
  assert(submission.submitted, "Initial submit succeeds");
  ui.acceptServerResponse(submission.body);
  assert(ui.displayedResultTimeframe() === "الساعة", "Result shows original 1h timeframe");
  ui.setTimeframe("4h");
  assert(ui.displayedResultTimeframe() === "الساعة", "Displayed result timeframe unchanged after selector change");
  assert(ui.state.postCount === 1, "No second POST after selector change");
}

// 6. Loading shows sent symbol and timeframe
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "1h" });
  const submission = ui.submit();
  assert(
    submission.loadingMessage === "جارٍ تحليل BTCUSDT على فريم الساعة.",
    "Loading message uses request snapshot"
  );
  assert(ui.state.requestSnapshot?.timeframe === "1h", "Snapshot locks timeframe during loading");
  assert(ui.state.requestSnapshot?.symbol === "BTCUSDT", "Snapshot locks symbol during loading");
}

// 7. Missing timeframe blocks request
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "" });
  const submission = ui.submit();
  assert(!submission.submitted, "Empty timeframe blocks submit");
  assert(submission.message === "يرجى اختيار الفريم المطلوب للتحليل.", "Missing timeframe message");
  assert(ui.state.postCount === 0, "No POST when timeframe missing");
}

// 8. Missing symbol blocks request
{
  const ui = createUiRequestSimulator({ symbol: "", timeframe: "1h" });
  const submission = ui.submit();
  assert(!submission.submitted, "Empty symbol blocks submit");
  assert(submission.message === "يرجى اختيار العملة أولاً.", "Missing symbol message");
  assert(ui.state.postCount === 0, "No POST when symbol missing");
}

// 9. Cooldown does not start before server acceptance
{
  const ui = createUiRequestSimulator({ symbol: "BTCUSDT", timeframe: "1h" });
  assert(!ui.state.countdownApplied, "No cooldown before submit");
  const submission = ui.submit();
  assert(submission.submitted, "Submit accepted locally");
  assert(!ui.state.countdownApplied, "Cooldown must not start before server response");
  ui.acceptServerResponse(submission.body);
  assert(ui.state.countdownApplied, "Cooldown starts after server acceptance");
  assert(ui.state.availability.allowed === false, "Availability locked after acceptance");
}

// Result timeframe resolves from meta only
{
  const tf = resolveResultExecutionTimeframe({
    v2: { meta: { executionTimeframe: "4h" } },
  });
  assert(tf === "4h", "resolveResultExecutionTimeframe reads meta.executionTimeframe");
  assert(
    labelResultTimeframe({ meta: { executionTimeframe: "4h" } }) === "4 ساعات",
    "Result label comes from meta, not selector"
  );
}

// Canonical timeframe normalization across UI → Worker → OKX bar
{
  const canonicalKeys = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  assert(canonicalKeys.length === 9, "Nine execution timeframes defined");

  for (const key of canonicalKeys) {
    const uiBody = buildAnalysisRequestBody({ symbol: "BTCUSDT", timeframe: key });
    assert(uiBody.executionTimeframe === key, `UI sends canonical ${key}`);

    const workerResolution = resolveExecutionTimeframeInput(key);
    assert(workerResolution.ok, `Worker accepts ${key}`);
    assert(workerResolution.key === key, `Worker keeps canonical ${key}`);

    const okxBar = getExecutionTimeframeConfig(key).bar;
    assert(typeof okxBar === "string" && okxBar.length >= 2, `OKX bar mapped for ${key}`);
  }

  const aliasCases = [
    ["1H", "1h", "1H"],
    ["4H", "4h", "4H"],
    ["1D", "1d", "1D"],
    ["1W", "1w", "1W"],
  ];

  for (const [input, canonical, okxBar] of aliasCases) {
    const body = buildAnalysisRequestBody({ symbol: "BTCUSDT", timeframe: input });
    assert(body.executionTimeframe === canonical, `${input} normalizes to ${canonical} in request body`);
    const workerResolution = resolveExecutionTimeframeInput(input);
    assert(workerResolution.ok && workerResolution.key === canonical, `Worker accepts alias ${input}`);
    assert(getExecutionTimeframeConfig(canonical).bar === okxBar, `${canonical} maps to OKX bar ${okxBar}`);
  }

  const invalid = resolveExecutionTimeframeInput("2h");
  assert(!invalid.ok, "Invalid timeframe rejected");
  assert(invalid.code === "INVALID_TIMEFRAME", "Invalid timeframe code");
  assert(
    invalid.message.includes("غير مدعوم"),
    "Invalid timeframe returns Arabic-safe message"
  );

  assert(EXECUTION_TIMEFRAME_OPTIONS.length === 9, "Worker exposes nine execution options");
}

console.log("instant-analysis-v3-request tests passed");
