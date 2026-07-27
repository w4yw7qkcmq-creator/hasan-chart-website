import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PAYMENT_NETWORKS,
  PAYMENT_NETWORK_OPTIONS,
  PAYMENT_NETWORK_VALUES,
  formatPaymentNetworkForAdmin,
  getPaymentNetworkAddress,
  getPaymentNetworkLabel,
  normalizePaymentNetwork,
  validatePaymentNetwork,
} from "../lib/payment-networks.js";
import { formatSubscriptionRequest } from "../app/(app)/admin/admin-dashboard-helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function testOnlyTwoOptions() {
  assert.deepEqual(PAYMENT_NETWORK_VALUES, ["TRC20", "BEP20"]);
  assert.equal(PAYMENT_NETWORK_OPTIONS.length, 2);
  assert.deepEqual(
    PAYMENT_NETWORK_OPTIONS.map((option) => option.label),
    ["TRC 20", "BEP 20"]
  );
}

function testTrc20Address() {
  assert.equal(
    getPaymentNetworkAddress("TRC20"),
    PAYMENT_NETWORKS.TRC20.address
  );
  assert.equal(
    getPaymentNetworkAddress("TRC 20"),
    "TDaNDYL8BzM6whvcX6nQkz2MSGMKwpXnBE"
  );
}

function testBep20Address() {
  assert.equal(
    getPaymentNetworkAddress("BEP20"),
    PAYMENT_NETWORKS.BEP20.address
  );
  assert.equal(
    getPaymentNetworkAddress("BEP 20"),
    "0x5088c78d5e53da45a3eb930f26462e2a76eb389d"
  );
}

function testNetworkSwitchChangesAddress() {
  assert.notEqual(
    getPaymentNetworkAddress("TRC20"),
    getPaymentNetworkAddress("BEP20")
  );
}

function testValidationAcceptsAllowedValues() {
  assert.deepEqual(validatePaymentNetwork("TRC20"), {
    ok: true,
    value: "TRC20",
  });
  assert.deepEqual(validatePaymentNetwork("BEP20"), {
    ok: true,
    value: "BEP20",
  });
  assert.equal(normalizePaymentNetwork("trc-20"), "TRC20");
  assert.equal(normalizePaymentNetwork("bep_20"), "BEP20");
}

function testValidationRejectsOtherNetworks() {
  const result = validatePaymentNetwork("ERC20");
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_PAYMENT_NETWORK");
  assert.match(result.error, /TRC 20/);
}

function testUiUsesCentralSource() {
  const uiSource = read("app/(app)/subscriptions/SubscriptionsAuthenticated.js");
  assert.match(uiSource, /PAYMENT_NETWORK_OPTIONS/);
  assert.match(uiSource, /getPaymentNetworkAddress/);
  assert.match(uiSource, /validatePaymentNetwork/);
  assert.match(uiSource, /payment_network: networkValidation\.value/);
  assert.match(uiSource, /اختر الشبكة/);
  assert.match(uiSource, /نسخ العنوان/);
  assert.match(uiSource, /copyPaymentAddress/);
  assert.doesNotMatch(uiSource, /TDaNDYL8BzM6whvcX6nQkz2MSGMKwpXnBE/);
  assert.doesNotMatch(uiSource, /0x5088c78d5e53da45a3eb930f26462e2a76eb389d/);
}

function testInitApiValidatesNetwork() {
  const source = read("app/api/subscription-request/init/route.js");
  assert.match(source, /validatePaymentNetwork/);
  assert.match(source, /payment_network/);
  assert.match(source, /networkValidation\.code/);
}

function testFlowPersistsNetwork() {
  const flowSource = read("lib/payment-proof-subscription-flow.js");
  assert.match(flowSource, /payment_network/);
  assert.match(flowSource, /validatePaymentNetwork/);
  assert.match(flowSource, /payment_network: networkValidation\.value/);
  assert.match(flowSource, /payment_network: session\.payment_network/);
}

function testAdminDisplaysNetwork() {
  const adminSource = read("app/(app)/admin/page.js");
  const helpersSource = read("app/(app)/admin/admin-dashboard-helpers.js");
  const sectionsSource = read("lib/admin-dashboard-sections.js");

  assert.match(sectionsSource, /payment_network/);
  assert.match(helpersSource, /paymentNetworkLabel/);
  assert.match(helpersSource, /getPaymentNetworkLabel/);
  assert.match(adminSource, /req\.paymentNetworkLabel/);
  assert.match(adminSource, /req\.paymentNetworkAddress/);
}

function testLegacyNullNetworkSafe() {
  const formatted = formatSubscriptionRequest({
    id: "42",
    user_email: "user@example.com",
    username: "User",
    plan_name: "Spot",
    category: "spot",
    price: "50",
    telegram_username: "@user",
    payment_network: null,
    has_payment_proof: true,
    status: "بانتظار المراجعة",
    created_at: "2026-06-10T07:22:00.000Z",
    timeline: [],
    timeline_summary: {
      totalEvents: 0,
      lastUpdateLabel: "—",
      lastAdminEmail: "—",
      hasAdminHistory: false,
    },
  });

  assert.equal(formatted.paymentNetwork, "");
  assert.equal(formatted.paymentNetworkLabel, "");
  assert.equal(formatted.paymentNetworkAddress, "");
}

function testAdminLabelFormatting() {
  assert.equal(formatPaymentNetworkForAdmin("TRC20"), "نوع الشبكة: TRC 20");
  assert.equal(formatPaymentNetworkForAdmin("BEP20"), "نوع الشبكة: BEP 20");
  assert.equal(formatPaymentNetworkForAdmin(null), "");
}

function testMigrationPrepared() {
  const sql = read("supabase/migrations/20260727_subscription_payment_network.sql");
  assert.match(sql, /payment_network text/);
  assert.match(sql, /subscription_requests/);
  assert.match(sql, /subscription_upload_sessions/);
  assert.match(sql, /CHECK \(payment_network IS NULL OR payment_network IN \('TRC20', 'BEP20'\)\)/);
}

function testFormattedRequestIncludesNetwork() {
  const formatted = formatSubscriptionRequest({
    id: "42",
    user_email: "user@example.com",
    username: "User",
    plan_name: "Spot",
    category: "spot",
    price: "50",
    telegram_username: "@user",
    payment_network: "TRC20",
    has_payment_proof: true,
    status: "بانتظار المراجعة",
    created_at: "2026-06-10T07:22:00.000Z",
    timeline: [],
    timeline_summary: {
      totalEvents: 0,
      lastUpdateLabel: "—",
      lastAdminEmail: "—",
      hasAdminHistory: false,
    },
  });

  assert.equal(formatted.paymentNetwork, "TRC20");
  assert.equal(formatted.paymentNetworkLabel, getPaymentNetworkLabel("TRC20"));
  assert.equal(formatted.paymentNetworkAddress, getPaymentNetworkAddress("TRC20"));
}

const tests = [
  ["only two payment network options", testOnlyTwoOptions],
  ["TRC20 shows correct address", testTrc20Address],
  ["BEP20 shows correct address", testBep20Address],
  ["network switch changes address", testNetworkSwitchChangesAddress],
  ["validation accepts TRC20 and BEP20", testValidationAcceptsAllowedValues],
  ["validation rejects other networks", testValidationRejectsOtherNetworks],
  ["UI uses central payment network source", testUiUsesCentralSource],
  ["init API validates payment network", testInitApiValidatesNetwork],
  ["flow persists payment network", testFlowPersistsNetwork],
  ["admin displays selected network", testAdminDisplaysNetwork],
  ["legacy null payment_network is safe", testLegacyNullNetworkSafe],
  ["admin label formatting", testAdminLabelFormatting],
  ["migration prepared for payment_network", testMigrationPrepared],
  ["formatted request includes network", testFormattedRequestIncludesNetwork],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${passed} payment network checks passed`);
