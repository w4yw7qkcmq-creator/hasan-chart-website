#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve("app/components/PublicClientProviders.js"),
  "utf8"
);

assert.match(source, /import \{ AnalyticsProvider \} from "\.\/AnalyticsProvider"/);
assert.match(source, /<AnalyticsProvider>/);
assert.match(source, /<\/AnalyticsProvider>/);

console.log("public analytics provider wiring PASS");
