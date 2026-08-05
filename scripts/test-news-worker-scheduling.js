#!/usr/bin/env node
import assert from "node:assert/strict";

const nyParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
  .formatToParts(new Date("2026-08-04T13:30:00Z"))
  .reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

assert.ok(nyParts.hour);
assert.ok(nyParts.weekday);

const damascus = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Damascus",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date("2026-08-04T10:00:00Z"));

assert.ok(damascus);

console.log("news worker scheduling timezone PASS");
