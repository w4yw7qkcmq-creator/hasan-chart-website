import assert from "node:assert/strict";
import test from "node:test";
import { scrubSentryEvent } from "../lib/sentry-scrub.js";
import { getSentryInitOptions } from "../lib/sentry-options.js";

test("scrubSentryEvent removes Authorization and cookies", () => {
  const event = scrubSentryEvent({
    request: {
      headers: {
        Authorization: "Bearer secret-token",
        Cookie: "hc_access_token=abc123",
        "X-Request-Id": "req123",
      },
      cookies: {
        hc_access_token: "abc123",
      },
      data: {
        password: "hunter2",
        note: "safe value",
      },
      url: "https://www.hasanchartworld.com/api/auth/login?token=abc123",
    },
    user: {
      email: "user@example.com",
      id: "user-uuid-12345678",
    },
    breadcrumbs: [
      {
        message: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test",
        data: { apiKey: "sk_live_abc" },
      },
    ],
  });

  assert.equal(event.request.headers.Authorization, "[redacted]");
  assert.equal(event.request.headers.Cookie, "[redacted]");
  assert.equal(event.request.cookies, "[redacted]");
  assert.equal(event.request.data.password, "[redacted]");
  assert.equal(event.request.data.note, "safe value");
  assert.equal(event.user.email, undefined);
  assert.equal(event.user.id, "[redacted-id]");
  assert.match(event.request.url, /token=(%5Bredacted%5D|\[redacted\])/);
  assert.match(event.breadcrumbs[0].message, /\[redacted\]/);
  assert.equal(event.breadcrumbs[0].data.apiKey, "[redacted]");
});

test("getSentryInitOptions is error-only and privacy-safe when DSN present", () => {
  const previous = {
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    enabled: process.env.SENTRY_ENABLED,
  };

  process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
  process.env.SENTRY_RELEASE = "testrelease123";
  process.env.SENTRY_ENABLED = "1";

  const options = getSentryInitOptions();
  assert.ok(options);
  assert.equal(options.sendDefaultPii, false);
  assert.equal(options.tracesSampleRate, 0);
  assert.equal(options.replaysSessionSampleRate, 0);
  assert.equal(options.replaysOnErrorSampleRate, 0);
  assert.equal(options.profilesSampleRate, 0);
  assert.equal(options.dataCollection.userInfo, false);
  assert.deepEqual(options.dataCollection.httpBodies, []);
  assert.equal(typeof options.beforeSend, "function");

  process.env.SENTRY_DSN = previous.dsn;
  process.env.SENTRY_RELEASE = previous.release;
  process.env.SENTRY_ENABLED = previous.enabled;
});

test("getSentryInitOptions returns null without DSN", () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;

  assert.equal(getSentryInitOptions(), null);

  if (previous) {
    process.env.SENTRY_DSN = previous;
  }
});
