#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isSafeExternalFetchUrl } = require("../worker/lib/news-fetch-security.js");

assert.equal(isSafeExternalFetchUrl("https://www.cnbc.com/id/image.jpg"), true);
assert.equal(isSafeExternalFetchUrl("http://127.0.0.1/image.jpg"), false);
assert.equal(isSafeExternalFetchUrl("file:///etc/passwd"), false);
assert.equal(isSafeExternalFetchUrl("http://localhost/test"), false);
assert.equal(isSafeExternalFetchUrl("http://192.168.1.1/test"), false);

console.log("news worker fetch security PASS");
