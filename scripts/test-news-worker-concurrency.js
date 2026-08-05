#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lock = require("../worker/lib/news-worker-cycle-lock.js");

lock.resetCycleLockForTests();
const first = lock.acquireCycleLock();
assert.equal(first.acquired, true);
const second = lock.acquireCycleLock();
assert.equal(second.acquired, false);
lock.releaseCycleLock();
const third = lock.acquireCycleLock();
assert.equal(third.acquired, true);
lock.releaseCycleLock();

console.log("news worker concurrency lock PASS");
