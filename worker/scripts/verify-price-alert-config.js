const {
  buildPriceAlertEmailPayload,
  PRICE_ALERT_FROM,
} = require("../price-alert-email");

const EXPECTED_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const MIN_INTERVAL_MS = 30_000;
const CLAMP_ABOVE_MS = 60_000;

function resolvePriceAlertCheckIntervalMs(rawValue) {
  let intervalMs = Number(rawValue);

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    intervalMs = MIN_INTERVAL_MS;
  }

  if (intervalMs > CLAMP_ABOVE_MS) {
    intervalMs = MIN_INTERVAL_MS;
  }

  return Math.max(intervalMs, MIN_INTERVAL_MS);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const cases = [
  { input: undefined, expected: 30_000 },
  { input: 120_000, expected: 30_000 },
  { input: 90_000, expected: 30_000 },
  { input: 45_000, expected: 45_000 },
  { input: 30_000, expected: 30_000 },
  { input: 12_000, expected: 30_000 },
];

for (const testCase of cases) {
  const resolved = resolvePriceAlertCheckIntervalMs(testCase.input);
  assert(
    resolved === testCase.expected,
    `interval ${String(testCase.input)} resolved to ${resolved}, expected ${testCase.expected}`
  );
}

assert(PRICE_ALERT_FROM === EXPECTED_FROM, `Unexpected PRICE_ALERT_FROM: ${PRICE_ALERT_FROM}`);

const payload = buildPriceAlertEmailPayload({
  email: "test@example.com",
  coinLabel: "BTC-USDT",
  conditionLabel: "وصول السعر للأعلى",
  targetPrice: "65000",
  currentPrice: "65012.45",
  alertId: "verify-alert-id",
});

assert(payload.from === EXPECTED_FROM, `Email payload from mismatch: ${payload.from}`);
assert(
  payload.subject.includes("BTC-USDT"),
  `Unexpected email subject: ${payload.subject}`
);

console.log("verify-price-alert-config: OK", {
  checkIntervalMs: resolvePriceAlertCheckIntervalMs(process.env.PRICE_ALERT_CHECK_INTERVAL_MS),
  sender: payload.from,
});
