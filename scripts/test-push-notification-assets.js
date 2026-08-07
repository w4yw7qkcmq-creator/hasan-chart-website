#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  MAIN_WEBSITE_LOGO_PATH,
  WEB_PUSH_NOTIFICATION_BADGE,
  WEB_PUSH_NOTIFICATION_ICON,
} from "../lib/push-notification-assets.js";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

assert.equal(WEB_PUSH_NOTIFICATION_ICON, "/favicon-192.png");
assert.equal(WEB_PUSH_NOTIFICATION_BADGE, "/favicon-192.png");
assert.equal(MAIN_WEBSITE_LOGO_PATH, "/favicon-192.png");
assert.equal(existsSync(join(ROOT, "public/favicon-192.png")), true);

const layout = read("app/layout.js");
assert.match(layout, /\/favicon-192\.png/);

const pushLib = read("lib/push-notifications.js");
assert.match(pushLib, /WEB_PUSH_NOTIFICATION_ICON/);
assert.doesNotMatch(pushLib, /\/logo\.png/);

const pushWorker = read("worker/push-sender.js");
assert.match(pushWorker, /\/favicon-192\.png/);
assert.doesNotMatch(pushWorker, /\/logo\.png/);

const sw = read("public/sw.js");
assert.match(sw, /icon: "\/favicon-192\.png"/);
assert.match(sw, /badge: "\/favicon-192\.png"/);
assert.match(sw, /payload\.icon \|\| "\/favicon-192\.png"/);
assert.doesNotMatch(sw, /\/logo\.png/);

console.log("Push notification assets PASS");
