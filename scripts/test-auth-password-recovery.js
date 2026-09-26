import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertRecoveryIdentityIsolated,
  clearPendingRecoveryParts,
  establishRecoverySession,
  parseRecoveryUrlParts,
  resolvePasswordRecoveryRedirectUrl,
  takeRecoveryUrlParts,
  validateRecoveryPassword,
} from "../lib/auth-password-recovery.js";

const root = process.cwd();

function read(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

describe("recovery redirect URL", () => {
  it("uses canonical production reset path when site URL is missing", () => {
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({ siteUrl: "", nodeEnv: "production" }),
      "https://www.hasanchartworld.com/reset-password"
    );
  });

  it("uses configured https origin plus reset path", () => {
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({
        siteUrl: "https://www.hasanchartworld.com/",
        nodeEnv: "production",
      }),
      "https://www.hasanchartworld.com/reset-password"
    );
  });

  it("allows localhost only outside production", () => {
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({
        siteUrl: "http://localhost:3000",
        nodeEnv: "development",
      }),
      "http://localhost:3000/reset-password"
    );
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({
        siteUrl: "http://localhost:3000",
        nodeEnv: "production",
      }),
      "https://www.hasanchartworld.com/reset-password"
    );
  });

  it("ignores attacker-controlled paths, credentials, and query", () => {
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({
        siteUrl: "https://evil.example/phish",
        nodeEnv: "production",
      }),
      "https://www.hasanchartworld.com/reset-password"
    );
    assert.equal(
      resolvePasswordRecoveryRedirectUrl({
        siteUrl: "https://user:pass@evil.example",
        nodeEnv: "production",
      }),
      "https://www.hasanchartworld.com/reset-password"
    );
  });
});

describe("recovery URL parsing", () => {
  it("accepts official token_hash recovery links", () => {
    assert.deepEqual(
      parseRecoveryUrlParts({
        search: "?token_hash=test_hash&type=recovery",
        hash: "",
      }),
      {
        kind: "token_hash",
        type: "recovery",
        tokenHash: "test_hash",
      }
    );
  });

  it("accepts official implicit recovery fragments", () => {
    const parsed = parseRecoveryUrlParts({
      search: "",
      hash: "#access_token=test_access&refresh_token=test_refresh&type=recovery",
    });
    assert.equal(parsed.kind, "session_tokens");
    assert.equal(parsed.type, "recovery");
  });

  it("accepts PKCE code on the recovery page", () => {
    assert.equal(
      parseRecoveryUrlParts({ search: "?code=test_code", hash: "" }).kind,
      "pkce_code"
    );
  });

  it("rejects non-recovery auth types", () => {
    assert.equal(
      parseRecoveryUrlParts({
        search: "?token_hash=test_hash&type=magiclink",
        hash: "",
      }).kind,
      "unsupported"
    );
    assert.equal(
      parseRecoveryUrlParts({
        search: "",
        hash: "#access_token=test_access&refresh_token=test_refresh&type=signup",
      }).kind,
      "unsupported"
    );
  });

  it("rejects missing credentials and expired error links", () => {
    assert.equal(parseRecoveryUrlParts({ search: "", hash: "" }).kind, "missing");
    assert.equal(
      parseRecoveryUrlParts({
        search: "?error=access_denied&error_code=otp_expired",
        hash: "",
      }).kind,
      "expired"
    );
    assert.equal(
      parseRecoveryUrlParts({
        search: "?error=access_denied&error_code=otp_disabled",
        hash: "",
      }).kind,
      "invalid"
    );
  });
});

describe("recovery identity isolation", () => {
  it("allows recovery when no cookie session exists", () => {
    assert.deepEqual(
      assertRecoveryIdentityIsolated({
        recoveryUserId: "user-b",
        cookieUserId: null,
      }),
      { ok: true, reason: null }
    );
  });

  it("allows recovery when cookie session is the same user", () => {
    assert.equal(
      assertRecoveryIdentityIsolated({
        recoveryUserId: "user-a",
        cookieUserId: "user-a",
      }).ok,
      true
    );
  });

  it("blocks cookie session of a different user", () => {
    assert.deepEqual(
      assertRecoveryIdentityIsolated({
        recoveryUserId: "user-b",
        cookieUserId: "user-a",
      }),
      { ok: false, reason: "session_mismatch" }
    );
  });

  it("blocks password change without a recovery user", () => {
    assert.equal(
      assertRecoveryIdentityIsolated({
        recoveryUserId: "",
        cookieUserId: "user-a",
      }).ok,
      false
    );
  });
});

describe("recovery password validation", () => {
  it("matches register policy: 6 characters and confirmation", () => {
    assert.equal(validateRecoveryPassword("12345", "12345").ok, false);
    assert.equal(validateRecoveryPassword("123456", "123457").ok, false);
    assert.equal(validateRecoveryPassword("123456", "123456").ok, true);
  });
});

describe("isolated recovery session establishment", () => {
  it("uses verifyOtp only for token_hash recovery", async () => {
    const calls = [];
    const client = {
      auth: {
        async verifyOtp(payload) {
          calls.push(["verifyOtp", payload.type]);
          return {
            data: {
              user: { id: "user-1", email: "a@test.com" },
              session: { access_token: "access-1" },
            },
            error: null,
          };
        },
        async exchangeCodeForSession() {
          throw new Error("should_not_exchange");
        },
        async setSession() {
          throw new Error("should_not_set_session");
        },
      },
    };

    const result = await establishRecoverySession(client, {
      kind: "token_hash",
      tokenHash: "hash-1",
      type: "recovery",
    });
    assert.equal(result.ok, true);
    assert.equal(result.user.id, "user-1");
    assert.deepEqual(calls, [["verifyOtp", "recovery"]]);
  });

  it("does not treat cookie-less missing recovery as updatable", async () => {
    const result = await establishRecoverySession(
      { auth: {} },
      { kind: "missing" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid");
  });
});

describe("recovery URL cleanup", () => {
  it("removes hash and query after taking recovery parts", () => {
    const url = new URL("https://www.hasanchartworld.com/reset-password?token_hash=test_hash&type=recovery");
    let replaced = "";
    global.window = {
      location: {
        href: url.href,
        search: url.search,
        hash: "",
        pathname: url.pathname,
      },
      history: {
        replaceState(_a, _b, next) {
          replaced = String(next);
        },
      },
    };

    try {
      const parsed = takeRecoveryUrlParts(global.window);
      assert.equal(parsed.kind, "token_hash");
      assert.equal(replaced, "/reset-password");
    } finally {
      clearPendingRecoveryParts();
      delete global.window;
    }
  });
});

describe("source contracts", () => {
  it("server reset route ignores client redirectTo", () => {
    const source = read("app/api/auth/reset-password/route.js");
    assert.match(source, /resolvePasswordRecoveryRedirectUrl/);
    assert.doesNotMatch(source, /body\?\.redirectTo|redirectTo \|\||headers\.get\("origin"\)/);
  });

  it("login forgot-password no longer sends redirectTo", () => {
    const source = read("app/(app)/login/LoginClient.js");
    assert.match(source, /\/api\/auth\/reset-password/);
    assert.doesNotMatch(source, /redirectTo:\s*`\$\{window\.location\.origin\}\/login`/);
  });

  it("admin recovery links use the same destination helper", () => {
    const source = read("lib/account-lifecycle.js");
    assert.match(source, /generateLink\(\{\s*type:\s*"recovery"/);
    assert.match(source, /resolvePasswordRecoveryRedirectUrl\(\)/);
    assert.doesNotMatch(source, /redirectTo: `\$\{siteUrl.*\}\/login`/);
  });

  it("reset page does not reuse login auto-redirect", () => {
    const source = read("app/(app)/reset-password/ResetPasswordClient.js");
    assert.doesNotMatch(source, /resolvePostLoginDestination/);
    assert.doesNotMatch(source, /router\.replace/);
    assert.match(source, /updatePasswordAndRevokePriorSessions/);
    assert.match(source, /assertRecoveryIdentityIsolated/);
    assert.doesNotMatch(source, /localStorage/);
  });

  it("keeps global detectSessionInUrl disabled", () => {
    const source = read("lib/supabase.js");
    assert.match(source, /detectSessionInUrl:\s*false/);
  });

  it("treats reset-password as an auth page in the shell", () => {
    const source = read("app/components/RootLayoutShell.js");
    assert.match(source, /pathname === "\/reset-password"/);
  });
});
