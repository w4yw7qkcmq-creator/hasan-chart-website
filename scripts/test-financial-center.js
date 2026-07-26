import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseSubscriptionPrice,
  normalizeSubscriptionStatus,
  isRecognizedRevenueCandidate,
  addToCurrencyTotals,
  buildCurrencyTotals,
} from "../lib/financial-center/financial-center-shared.js";
import { normalizeSubscriptionRow } from "../lib/financial-center/subscription-service.js";
import {
  normalizePaymentReviewRow,
  resolvePaymentReviewStatus,
} from "../lib/financial-center/payment-service.js";
import { aggregateRecognizedRows } from "../lib/financial-center/revenue-service.js";
import { SUBSCRIPTION_STATUSES } from "../lib/financial-center/financial-types.js";
import { hasAdminPermission } from "../lib/admin-permissions.js";

function testParsePrices() {
  assert.deepEqual(parseSubscriptionPrice("100"), { amount: 100, currency: "USD", valid: true, complimentary: false, raw: "100" });
  assert.deepEqual(parseSubscriptionPrice("$100").amount, 100);
  assert.deepEqual(parseSubscriptionPrice("100 USD").currency, "USD");
  assert.deepEqual(parseSubscriptionPrice("100 USDT").currency, "USDT");
  assert.equal(parseSubscriptionPrice("مجاني").complimentary, true);
  assert.equal(parseSubscriptionPrice("Free").amount, 0);
  assert.equal(parseSubscriptionPrice("سعر غريب").valid, false);
}

function testNormalizeStatuses() {
  assert.equal(
    normalizeSubscriptionStatus("مفعل", { adminDisabled: false, expiresAt: "2099-01-01T00:00:00.000Z" }),
    SUBSCRIPTION_STATUSES.ACTIVE
  );
  assert.equal(
    normalizeSubscriptionStatus("مفعل", { adminDisabled: false, expiresAt: "2020-01-01T00:00:00.000Z" }),
    SUBSCRIPTION_STATUSES.EXPIRED
  );
  assert.equal(normalizeSubscriptionStatus("مفعل", { adminDisabled: true }), SUBSCRIPTION_STATUSES.SUSPENDED);
  assert.equal(normalizeSubscriptionStatus("بانتظار المراجعة"), SUBSCRIPTION_STATUSES.PENDING);
  assert.equal(normalizeSubscriptionStatus("مرفوض"), SUBSCRIPTION_STATUSES.REJECTED);
}

function testPendingWithProofNotConfirmed() {
  const row = {
    id: 1,
    status: "بانتظار المراجعة",
    payment_proof: "data:image/png;base64,abc",
    price: "100",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const review = normalizePaymentReviewRow(row);
  assert.equal(review.status, "pending_review");
  assert.equal(review.proofAvailable, true);
  assert.notEqual(review.status, "confirmed");
}

function testRecognizedRevenueRules() {
  const activePaid = {
    status: "مفعل",
    started_at: "2026-07-01T00:00:00.000Z",
    admin_disabled: false,
    price: "100 USD",
    category: "VIP Spot",
  };
  const parsed = parseSubscriptionPrice(activePaid.price);
  const normalized = normalizeSubscriptionStatus(activePaid.status, { expiresAt: "2099-01-01T00:00:00.000Z" });
  assert.equal(isRecognizedRevenueCandidate(activePaid, parsed, normalized), true);

  const pending = { ...activePaid, status: "بانتظار المراجعة" };
  assert.equal(
    isRecognizedRevenueCandidate(pending, parsed, normalizeSubscriptionStatus(pending.status)),
    false
  );

  const free = { ...activePaid, price: "مجاني", activation_source: "complimentary" };
  const freeParsed = parseSubscriptionPrice(free.price);
  assert.equal(
    isRecognizedRevenueCandidate(free, freeParsed, normalized),
    false
  );
}

function testCurrencySeparation() {
  const totals = buildCurrencyTotals();
  addToCurrencyTotals(totals, "USD", 100);
  addToCurrencyTotals(totals, "USDT", 50);
  assert.equal(totals.USD, 100);
  assert.equal(totals.USDT, 50);

  const aggregated = aggregateRecognizedRows([
    {
      status: "مفعل",
      started_at: new Date().toISOString(),
      admin_disabled: false,
      price: "100 USD",
      category: "VIP Spot",
    },
    {
      status: "مفعل",
      started_at: new Date().toISOString(),
      admin_disabled: false,
      price: "50 USDT",
      category: "VIP Futures",
    },
  ]);

  assert.equal(aggregated.recognizedRevenueTotal.USD, 100);
  assert.equal(aggregated.recognizedRevenueTotal.USDT, 50);
}

function testPermissions() {
  assert.equal(hasAdminPermission("accountant", "finance.read"), true);
  assert.equal(hasAdminPermission("analyst", "finance.read"), false);
  assert.equal(hasAdminPermission("admin", "finance.read"), true);
}

function testNormalizeSubscriptionRow() {
  const row = normalizeSubscriptionRow(
    {
      id: 10,
      user_email: "user@test.com",
      username: "User",
      plan_name: "VIP Spot",
      category: "spot",
      price: "100",
      status: "مفعل",
      started_at: "2026-07-01T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
      created_at: "2026-06-01T00:00:00.000Z",
      admin_disabled: false,
    },
    new Map([["user@test.com", "uid-1"]])
  );

  assert.equal(row.status, SUBSCRIPTION_STATUSES.ACTIVE);
  assert.equal(row.userId, "uid-1");
  assert.equal(row.priceAmount, 100);
}

function testFinanceUiMarkup() {
  const modalSource = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/admin/components/AdminPaymentProofModal.js"),
    "utf8"
  );
  assert.match(modalSource, /admin-financial-proof-modal__close/);
  assert.match(modalSource, /admin-financial-action-button--primary/);
  assert.match(modalSource, /admin-financial-proof-modal__image/);
  assert.match(modalSource, /onError=/);
  assert.match(modalSource, /document\.body\.style\.overflow = "hidden"/);
}

const tests = [
  ["parse prices", testParsePrices],
  ["normalize statuses", testNormalizeStatuses],
  ["pending proof not confirmed", testPendingWithProofNotConfirmed],
  ["recognized revenue rules", testRecognizedRevenueRules],
  ["currency separation", testCurrencySeparation],
  ["permissions", testPermissions],
  ["normalize subscription row", testNormalizeSubscriptionRow],
  ["finance ui markup", testFinanceUiMarkup],
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} financial center tests passed`);
