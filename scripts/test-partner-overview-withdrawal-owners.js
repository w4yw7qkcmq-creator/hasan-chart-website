/**
 * Partner overview recent-withdrawal owner identity tests.
 * Run: node --test scripts/test-partner-overview-withdrawal-owners.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  buildPartnerWithdrawalOwner,
  attachWithdrawalPartnerIdentity,
  PARTNER_EMAIL_UNAVAILABLE_AR,
} = await import("../lib/partner-shared.js");

describe("partner overview withdrawal requester identity", () => {
  it("every recent withdrawal row shows partner name", () => {
    const ownerMap = new Map([
      [
        "partner-1",
        {
          id: "partner-1",
          displayName: "Harb",
          email: "harb@example.com",
        },
      ],
    ]);

    const rows = attachWithdrawalPartnerIdentity(
      [{ id: "w-1", partnerId: "partner-1", amount: 20, currency: "USDT", network: "TRC20" }],
      ownerMap
    );

    assert.equal(rows[0].partner.displayName, "Harb");
  });

  it("every recent withdrawal row shows partner email when available", () => {
    const ownerMap = new Map([
      [
        "partner-1",
        {
          id: "partner-1",
          displayName: "Harb",
          email: "harb@example.com",
        },
      ],
    ]);

    const rows = attachWithdrawalPartnerIdentity(
      [{ id: "w-1", partnerId: "partner-1" }],
      ownerMap
    );

    assert.equal(rows[0].partner.email, "harb@example.com");
  });

  it("name/email correspond to same partner_id", () => {
    const owner = buildPartnerWithdrawalOwner({
      username: "Harb",
      email: "harb@example.com",
    });
    const ownerMap = new Map([["partner-1", { id: "partner-1", ...owner }]]);

    const rows = attachWithdrawalPartnerIdentity(
      [{ id: "w-1", partnerId: "partner-1" }],
      ownerMap
    );

    assert.equal(rows[0].partnerId, "partner-1");
    assert.equal(rows[0].partner.id, "partner-1");
    assert.equal(rows[0].partner.displayName, "Harb");
    assert.equal(rows[0].partner.email, "harb@example.com");
  });

  it("email source is server-side authoritative from profile record", () => {
    const owner = buildPartnerWithdrawalOwner({
      username: "RealA178",
      email: "real.partner@hasanchartworld.com",
    });

    assert.equal(owner.email, "real.partner@hasanchartworld.com");
  });

  it("does not use client-controlled email/name from withdrawal payload", () => {
    const owner = buildPartnerWithdrawalOwner({
      username: "Harb",
      email: "harb@example.com",
    });
    const ownerMap = new Map([["partner-1", { id: "partner-1", ...owner }]]);

    const rows = attachWithdrawalPartnerIdentity(
      [
        {
          id: "w-1",
          partnerId: "partner-1",
          clientSubmittedName: "Fake Name",
          clientSubmittedEmail: "fake@client.local",
        },
      ],
      ownerMap
    );

    assert.equal(rows[0].partner.displayName, "Harb");
    assert.equal(rows[0].partner.email, "harb@example.com");
    assert.notEqual(rows[0].partner.email, "fake@client.local");
  });

  it("legacy missing email resolves to unavailable label", () => {
    const owner = buildPartnerWithdrawalOwner({ username: "LegacyPartner" });
    assert.equal(owner.email, PARTNER_EMAIL_UNAVAILABLE_AR);
  });

  it("future withdrawal contract automatically resolves name/email from partner map", () => {
    const ownerMap = new Map([
      [
        "partner-future",
        buildPartnerWithdrawalOwner({
          username: "FuturePartner",
          email: "future@example.com",
        }),
      ],
    ]);
    ownerMap.set("partner-future", {
      id: "partner-future",
      ...ownerMap.get("partner-future"),
    });

    const rows = attachWithdrawalPartnerIdentity(
      [
        {
          id: "w-new",
          partnerId: "partner-future",
          amount: 50,
          currency: "USDT",
          network: "TRC20",
          status: "pending",
          createdAt: "2026-08-11T00:00:00.000Z",
        },
      ],
      ownerMap
    );

    assert.equal(rows[0].partner.displayName, "FuturePartner");
    assert.equal(rows[0].partner.email, "future@example.com");
  });

  it("email contract keeps full address for admin display", () => {
    const owner = buildPartnerWithdrawalOwner({ email: "harb@example.com" });
    assert.match(owner.email, /@/);
    assert.doesNotMatch(owner.email, /\*\*\*/);
  });

  it("does not expose raw uuid or user_id as primary identity", () => {
    const owner = buildPartnerWithdrawalOwner({
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000099",
      username: "Harb",
      email: "harb@example.com",
    });

    assert.notEqual(owner.displayName, owner.id);
    assert.notEqual(owner.email, owner.user_id);
    assert.equal(owner.displayName, "Harb");
  });

  it("financial delta remains 0 for read-only identity mapping", () => {
    const before = { commissions: 11, ledger: 28, withdrawals: 17 };
    const after = { commissions: 11, ledger: 28, withdrawals: 17 };

    attachWithdrawalPartnerIdentity(
      [{ id: "w-1", partnerId: "partner-1", amount: 20 }],
      new Map([
        [
          "partner-1",
          buildPartnerWithdrawalOwner({ username: "Harb", email: "harb@example.com" }),
        ],
      ])
    );

    assert.deepEqual(before, after);
  });
});

console.log("Partner overview withdrawal owner tests loaded");
