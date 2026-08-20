import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSyncSessionTokens,
  applyVerifiedSessionCookies,
} from "../lib/auth-sync-session-server.js";
import {
  crossOriginRequestResponse,
  isCrossOriginRequest,
} from "../lib/security/same-origin-request.js";

describe("sync-session token parsing", () => {
  it("rejects missing tokens", () => {
    assert.deepEqual(parseSyncSessionTokens({}), {
      accessToken: "",
      refreshToken: "",
    });
  });

  it("trims provided tokens", () => {
    assert.deepEqual(
      parseSyncSessionTokens({
        access_token: "  access  ",
        refresh_token: " refresh ",
      }),
      {
        accessToken: "access",
        refreshToken: "refresh",
      }
    );
  });
});

describe("sync-session same-origin guard", () => {
  it("allows missing origin", () => {
    const request = { headers: { get: (key) => (key === "host" ? "www.example.com" : "") } };
    assert.equal(isCrossOriginRequest(request), false);
  });

  it("allows matching origin", () => {
    const request = {
      headers: {
        get: (key) => {
          if (key === "host") return "www.example.com";
          if (key === "origin") return "https://www.example.com";
          return "";
        },
      },
    };
    assert.equal(isCrossOriginRequest(request), false);
  });

  it("blocks mismatched origin", () => {
    const request = {
      headers: {
        get: (key) => {
          if (key === "host") return "www.example.com";
          if (key === "origin") return "https://evil.example";
          return "";
        },
      },
    };
    assert.equal(isCrossOriginRequest(request), true);
    assert.equal(crossOriginRequestResponse().status, 403);
  });
});

describe("sync-session cookie write invariant", () => {
  it("does not expose tokens in cookie helper return", () => {
    const response = {
      cookies: {
        values: [],
        set(name, value, options) {
          this.values.push({ name, value, options });
        },
      },
    };

    applyVerifiedSessionCookies(response, {
      access_token: "verified-access",
      refresh_token: "verified-refresh",
      expires_in: 3600,
    });

    assert.equal(response.cookies.values.length, 2);
    assert.equal(response.cookies.values[0].name, "hc_access_token");
    assert.equal(response.cookies.values[0].options.httpOnly, true);
    assert.equal(response.cookies.values[1].name, "hc_refresh_token");
  });
});

console.log("auth sync-session security tests loaded");
