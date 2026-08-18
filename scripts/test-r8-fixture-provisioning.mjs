#!/usr/bin/env node
/**
 * Harness-only live staging tests — R8 fixture auth pagination + ensureUser contract.
 * STAGING ONLY.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadStagingClients, applyStagingPartnerFeatureFlags } from "./hv-abuse-pass2-lib.mjs";
import {
  assertStagingGuard,
  buildR8CoreFixtureEmails,
  ensureUser,
  findAuthUserByEmailPaginated,
  runR8FixturePreflight,
  FIXTURE_DOMAIN,
} from "./partner-center/r8-staging-harness-lib.mjs";

const PASSWORD = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
const FRAUD_HIGH_EMAIL = `r8-partner-fraud-high@${FIXTURE_DOMAIN}`;

function assertUuid(id, label) {
  assert.ok(id, `${label}: missing id`);
  assert.match(String(id), /^[0-9a-f-]{36}$/i, `${label}: invalid uuid ${id}`);
}

describe("r8 fixture provisioning harness", { timeout: 300_000 }, () => {
  it("resolves r8-partner-fraud-high via paginated auth lookup", async () => {
    assertStagingGuard();
    const { service } = loadStagingClients();
    const lookup = await findAuthUserByEmailPaginated(service, FRAUD_HIGH_EMAIL);
    assert.equal(lookup.found, true, "fraud-high auth user must exist on staging");
    assertUuid(lookup.user?.id, "fraud-high");
    assert.ok(lookup.pagesScanned >= 1, "must scan at least one auth page");
  });

  it("resolves an existing R8 fixture beyond the first auth page when needed", async () => {
    assertStagingGuard();
    const { service } = loadStagingClients();
    const emails = Object.values(buildR8CoreFixtureEmails());
    let deepest = null;
    for (const email of emails) {
      const lookup = await findAuthUserByEmailPaginated(service, email);
      assert.equal(lookup.found, true, `missing fixture auth user ${email}`);
      assertUuid(lookup.user?.id, email);
      if (!deepest || lookup.pagesScanned > deepest.pagesScanned) {
        deepest = { email, pagesScanned: lookup.pagesScanned, userId: lookup.user.id };
      }
    }
    assert.ok(deepest, "expected at least one R8 fixture email");
  });

  it("handles already-registered create path and returns exact user id", async () => {
    assertStagingGuard();
    const { service } = loadStagingClients();
    const email = FRAUD_HIGH_EMAIL;
    const first = await ensureUser(service, email, PASSWORD, { r8_fixture: true, probe: "first" });
    assertUuid(first, "first ensureUser");
    const second = await ensureUser(service, email, PASSWORD, { r8_fixture: true, probe: "second" });
    assertUuid(second, "second ensureUser");
    assert.equal(first, second, "duplicate ensureUser must reuse exact auth user id");
    const lookup = await findAuthUserByEmailPaginated(service, email);
    assert.equal(lookup.user?.id, first, "paginated lookup must match ensureUser id");
  });

  it("creates a disposable missing fixture user and second call is idempotent", async () => {
    assertStagingGuard();
    const { service } = loadStagingClients();
    const email = `r8-provision-probe-${Date.now()}@${FIXTURE_DOMAIN}`;
    const created = await ensureUser(service, email, PASSWORD, { r8_fixture_probe: true });
    assertUuid(created, "created probe user");
    const again = await ensureUser(service, email, PASSWORD, { r8_fixture_probe: true });
    assert.equal(again, created, "second call must reuse created user id");
    const lookup = await findAuthUserByEmailPaginated(service, email);
    assert.equal(lookup.found, true);
    assert.equal(lookup.user?.id, created);
  });

  it("runR8FixturePreflight provisions all core reusable fixtures with no null ids", async () => {
    assertStagingGuard();
    Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));
    const { service } = loadStagingClients();
    const runId = `r8_preflight_test_${Date.now()}`;
    const preflight = await runR8FixturePreflight(service, runId);
    assert.equal(preflight.ok, true);
    assertUuid(preflight.fraudHigh.userId, "preflight fraud-high user");
    assertUuid(preflight.fraudHigh.partnerId, "preflight fraud-high partner");
    assert.equal(preflight.fraudHigh.authFound, true);
    assert.ok(preflight.maxAuthPagesScanned >= 1);
    for (const check of preflight.checks) {
      assertUuid(check.userId, check.label);
    }
  });
});
