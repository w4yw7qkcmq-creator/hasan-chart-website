import * as Sentry from "@sentry/nextjs";
import { getSentryInitOptions } from "./lib/sentry-options.js";

const options = getSentryInitOptions();
if (options) {
  Sentry.init(options);
}
