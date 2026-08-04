import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOwnerCredentialMutationBlocked,
  filterCredentialMutationTargets,
  isStagingOwnerTarget,
} from "../lib/staging-owner-guard.js";

test("Staging owner credential guard", async (t) => {
  const env = {
    IAM_OWNER_EMAIL: "staging@hasanchartworld.com",
    STAGING_OWNER_USER_ID: "fb65ce75-61a9-4c2a-a194-702d8b14583c",
  };

  await t.test("blocks owner email mutation", () => {
    const blocked = assertOwnerCredentialMutationBlocked(
      { email: "staging@hasanchartworld.com" },
      env
    );
    assert.equal(blocked.blocked, true);
  });

  await t.test("blocks owner id mutation", () => {
    assert.equal(
      isStagingOwnerTarget({ userId: "fb65ce75-61a9-4c2a-a194-702d8b14583c" }, env),
      true
    );
  });

  await t.test("allows test account mutation", () => {
    const blocked = assertOwnerCredentialMutationBlocked(
      { email: "iam-test-support@staging-hcw.test" },
      env
    );
    assert.equal(blocked.blocked, false);
  });

  await t.test("filters owner from harness email list", () => {
    const filtered = filterCredentialMutationTargets(
      ["staging@hasanchartworld.com", "iam-test-admin@staging-hcw.test"],
      env
    );
    assert.deepEqual(filtered, ["iam-test-admin@staging-hcw.test"]);
  });
});
