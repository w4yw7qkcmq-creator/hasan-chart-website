import { scrubSentryEvent } from "./sentry-scrub.js";

function resolveSentryDsn() {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
}

function resolveSentryEnvironment() {
  return process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
}

function resolveSentryRelease() {
  return (
    process.env.SENTRY_RELEASE ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    undefined
  );
}

function isSentryEnabled() {
  return Boolean(resolveSentryDsn());
}

/**
 * Shared error-only Sentry init options for all Next.js runtimes.
 * @returns {import("@sentry/nextjs").Options | null}
 */
export function getSentryInitOptions() {
  const dsn = resolveSentryDsn();
  if (!dsn) {
    return null;
  }

  return {
    dsn,
    environment: resolveSentryEnvironment(),
    release: resolveSentryRelease(),
    enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLED === "1",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    ignoreErrors: [
      // Browser extension noise only — do not blanket-ignore app/runtime failures.
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
    ],
  };
}

export { isSentryEnabled, resolveSentryDsn, resolveSentryEnvironment, resolveSentryRelease };
