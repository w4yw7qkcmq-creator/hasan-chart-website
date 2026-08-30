#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  detectIsIOS,
  detectIsIOSBrowserTab,
  detectIsStandalone,
  detectPushPlatformContext,
  detectWebPushCapabilities,
  IOS_HOME_SCREEN_GUIDANCE_MESSAGE,
} from "../lib/push-platform.js";
import {
  PUSH_ENROLLMENT,
  resolvePushEnrollmentFromBrowserState,
} from "../lib/push-enrollment-state.js";

test("detectIsIOS: iPhone UA", () => {
  assert.equal(
    detectIsIOS(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    true
  );
});

test("detectIsIOS: desktop Chrome UA", () => {
  assert.equal(
    detectIsIOS(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    false
  );
});

test("detectIsIOSBrowserTab: iOS and not standalone", () => {
  assert.equal(
    detectIsIOSBrowserTab({
      isIOS: true,
      isStandalone: false,
    }),
    true
  );
});

test("detectIsIOSBrowserTab: iOS standalone PWA is not browser tab", () => {
  assert.equal(
    detectIsIOSBrowserTab({
      isIOS: true,
      isStandalone: true,
    }),
    false
  );
});

test("detectIsIOSBrowserTab: Android browser tab is false", () => {
  assert.equal(
    detectIsIOSBrowserTab({
      isIOS: false,
      isStandalone: false,
    }),
    false
  );
});

test("detectWebPushCapabilities: server-side defaults are unsupported", () => {
  const caps = detectWebPushCapabilities();
  assert.equal(caps.serviceWorkerSupported, false);
  assert.equal(caps.pushManagerSupported, false);
  assert.equal(caps.notificationSupported, false);
  assert.equal(caps.webPushSupported, false);
});

test("detectPushPlatformContext: accepts injected env for tests", () => {
  const ctx = detectPushPlatformContext({
    isIOS: true,
    isStandalone: false,
    capabilities: {
      serviceWorkerSupported: true,
      pushManagerSupported: false,
      notificationSupported: false,
      webPushSupported: false,
    },
  });

  assert.equal(ctx.isIOSBrowserTab, true);
  assert.equal(ctx.webPushSupported, false);
});

test("enrollment integration: iOS browser tab maps to needs_home_screen", () => {
  assert.equal(
    resolvePushEnrollmentFromBrowserState({
      needsHomeScreen: detectIsIOSBrowserTab({ isIOS: true, isStandalone: false }),
      serviceWorkerSupported: true,
      pushManagerSupported: false,
      notificationSupported: false,
    }),
    PUSH_ENROLLMENT.NEEDS_HOME_SCREEN
  );
});

test("guidance message includes home screen steps", () => {
  assert.match(IOS_HOME_SCREEN_GUIDANCE_MESSAGE, /الشاشة الرئيسية/);
  assert.match(IOS_HOME_SCREEN_GUIDANCE_MESSAGE, /Safari/);
});

test("RootLayoutShell does not auto-call requestPermission inside useEffect", () => {
  const shell = readFileSync(new URL("../app/components/RootLayoutShell.js", import.meta.url), "utf8");
  const useEffectBlocks = shell.match(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\);/g) || [];

  for (const block of useEffectBlocks) {
    assert.doesNotMatch(block, /Notification\.requestPermission/);
  }
});

test("RootLayoutShell iOS guidance does not call requestPermission", () => {
  const shell = readFileSync(new URL("../app/components/RootLayoutShell.js", import.meta.url), "utf8");
  assert.match(shell, /platform\.isIOSBrowserTab/);
  assert.match(shell, /IOS_HOME_SCREEN_GUIDANCE_MESSAGE/);
  const guidanceBlock = shell.slice(
    shell.indexOf("if (platform.isIOSBrowserTab)"),
    shell.indexOf("const capabilities = detectWebPushCapabilities();")
  );
  assert.doesNotMatch(guidanceBlock, /requestPermission/);
});

test("admin page no longer auto-requests notification permission", () => {
  const adminPage = readFileSync(new URL("../app/(app)/admin/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(adminPage, /Notification\.requestPermission\(\)/);
});

test("manifest exports standalone PWA fields", () => {
  const manifestSource = readFileSync(new URL("../app/manifest.js", import.meta.url), "utf8");
  assert.match(manifestSource, /display:\s*"standalone"/);
  assert.match(manifestSource, /favicon-192\.png/);
  assert.match(manifestSource, /favicon-512\.png/);
});

test("detectIsStandalone: server-side is false", () => {
  assert.equal(detectIsStandalone(), false);
});
