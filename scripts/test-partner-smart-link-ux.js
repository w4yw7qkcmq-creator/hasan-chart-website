#!/usr/bin/env node
/**
 * Partner Smart Link UX — error mapping, source contract, URL hardening, create matrix
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  mapSmartLinkErrorToMessage,
  isSmartLinkCampaignError,
} from "../lib/partner-center/smart-link-errors.js";
import {
  SMART_LINK_SOURCE_OPTIONS,
  buildEligibleCampaignOptions,
} from "../app/components/partner/growth/smart-link-form-options.js";
import {
  normalizeSmartLinkSource,
  ALLOWED_SMART_LINK_SOURCES,
} from "../lib/partner-center/smart-link-sources.js";
import { normalizePartnerSiteOrigin } from "../lib/partner-shared.js";
import {
  buildSmartLinkUrl,
  buildCanonicalSmartLinkUrl,
  resolveSmartLinkPublicUrl,
  createSmartLink,
  validateSmartLinkInput,
  resolveSmartLinkByShortCode,
} from "../lib/partner-center/smart-link-service.js";
import {
  generateSmartLinkShortCode,
  sanitizeSmartLinkShortCode,
  isSmartLinkShortCode,
  SMART_LINK_SHORT_CODE_LENGTH,
} from "../lib/partner-center/smart-link-short-code.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e.message);
  }
}

async function run() {
  await test("invalid_campaign maps to Arabic", () => {
    const msg = mapSmartLinkErrorToMessage("invalid_campaign");
    assert.match(msg, /الحملة/);
    assert.doesNotMatch(msg, /invalid_campaign/);
  });

  await test("campaign_not_eligible maps to Arabic", () => {
    const msg = mapSmartLinkErrorToMessage("campaign_not_eligible");
    assert.match(msg, /غير متاحة لحسابك/);
  });

  await test("invalid_source maps to Arabic", () => {
    const msg = mapSmartLinkErrorToMessage("invalid_source");
    assert.match(msg, /المصدر/);
  });

  await test("unknown error maps to generic Arabic", () => {
    const msg = mapSmartLinkErrorToMessage("something_internal");
    assert.equal(msg, "تعذر إنشاء الرابط الآن. حاول مرة أخرى.");
  });

  await test("campaign error detector", () => {
    assert.equal(isSmartLinkCampaignError("invalid_campaign"), true);
    assert.equal(isSmartLinkCampaignError("inactive_partner"), false);
  });

  await test("source options use Arabic labels and canonical values", () => {
    assert.equal(SMART_LINK_SOURCE_OPTIONS[0].value, "telegram");
    assert.equal(SMART_LINK_SOURCE_OPTIONS[0].label, "تيليغرام");
  });

  await test("eligible campaign options include no-campaign default", () => {
    const opts = buildEligibleCampaignOptions([
      { code: "summer", name: "حملة الصيف", eligible: true },
      { code: "old", name: "قديمة", eligible: false },
    ]);
    assert.equal(opts[0].value, "");
    assert.equal(opts[0].label, "بدون حملة");
    assert.equal(opts.length, 2);
    assert.equal(opts[1].value, "summer");
  });

  await test("normalizeSmartLinkSource accepts lowercase canonical values", () => {
    for (const value of ALLOWED_SMART_LINK_SOURCES) {
      assert.equal(normalizeSmartLinkSource(value), value);
    }
  });

  await test("normalizeSmartLinkSource accepts legacy Title Case aliases", () => {
    assert.equal(normalizeSmartLinkSource("WhatsApp"), "whatsapp");
    assert.equal(normalizeSmartLinkSource("Telegram"), "telegram");
    assert.equal(normalizeSmartLinkSource("YouTube"), "youtube");
  });

  await test("normalizeSmartLinkSource rejects invalid source", () => {
    assert.equal(normalizeSmartLinkSource("disks"), null);
    assert.equal(normalizeSmartLinkSource("instagram"), null);
  });

  await test("normalizePartnerSiteOrigin adds https when missing", () => {
    assert.equal(
      normalizePartnerSiteOrigin("www.hasanchartworld.com"),
      "https://www.hasanchartworld.com"
    );
  });

  await test("buildSmartLinkUrl survives host-only site URL", () => {
    const url = buildSmartLinkUrl("www.hasanchartworld.com", {
      referralCode: "HSCKKL6",
      token: "abc123",
      source: "whatsapp",
    });
    assert.match(url, /^https:\/\/www\.hasanchartworld\.com\/r\/HSCKKL6\?/);
    assert.match(url, /source=whatsapp/);
  });

  await test("buildCanonicalSmartLinkUrl is query-param free", () => {
    const url = buildCanonicalSmartLinkUrl("https://www.hasanchartworld.com", "Ab7K9xYz");
    assert.equal(url, "https://www.hasanchartworld.com/r/Ab7K9xYz");
    assert.doesNotMatch(url, /\?/);
  });

  await test("short code generator length and lowercase guard", () => {
    const code = generateSmartLinkShortCode();
    assert.equal(code.length, SMART_LINK_SHORT_CODE_LENGTH);
    assert.match(code, /^[A-Za-z0-9]+$/);
    assert.match(code, /[a-z]/);
  });

  await test("isSmartLinkShortCode distinguishes referral-only uppercase codes", () => {
    assert.equal(isSmartLinkShortCode("Ab7K9xYz"), true);
    assert.equal(isSmartLinkShortCode("GOKE2Q7CF"), false);
  });

  await test("resolveSmartLinkPublicUrl prefers short code", () => {
    const url = resolveSmartLinkPublicUrl("https://www.hasanchartworld.com", {
      short_code: "Ab7K9xYz",
      token: "legacytoken",
      source: "whatsapp",
    }, "GOKE2Q7CF");
    assert.equal(url, "https://www.hasanchartworld.com/r/Ab7K9xYz");
  });

  await test("resolveSmartLinkPublicUrl falls back to legacy long URL", () => {
    const url = resolveSmartLinkPublicUrl("https://www.hasanchartworld.com", {
      token: "abc123",
      source: "whatsapp",
      campaignCode: "summer",
    }, "GOKE2Q7CF");
    assert.match(url, /GOKE2Q7CF\?link=abc123/);
  });

  await test("validateSmartLinkInput rejects invalid source", () => {
    const result = validateSmartLinkInput({ destinationPath: "/register", source: "instagram" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_source");
  });

  await test("validateSmartLinkInput accepts whatsapp + register", () => {
    const result = validateSmartLinkInput({ destinationPath: "/register", source: "whatsapp" });
    assert.equal(result.ok, true);
    assert.equal(result.source, "whatsapp");
  });

  await test("validateSmartLinkInput blocks open redirect", () => {
    const result = validateSmartLinkInput({ destinationPath: "https://evil.com", source: "x" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_destination");
  });

  await test("undefined campaign payload validates source only", () => {
    const result = validateSmartLinkInput({
      destinationPath: "/register",
      source: "telegram",
      campaignCode: undefined,
    });
    assert.equal(result.ok, true);
  });

  await test("legacy WhatsApp casing normalizes", () => {
    const result = validateSmartLinkInput({ destinationPath: "/register", source: "WhatsApp" });
    assert.equal(result.ok, true);
    assert.equal(result.source, "whatsapp");
  });

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sb = null;
  let partnerId = null;
  let referralCode = null;

  if (url && key) {
    sb = createClient(url, key, { auth: { persistSession: false } });
    const email = process.env.E2E_USER_EMAIL?.trim().toLowerCase();
    if (email) {
      const { data: auth } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const user = auth?.users?.find((u) => u.email?.toLowerCase() === email);
      if (user?.id) {
        const { data: partner } = await sb
          .from("partners")
          .select("id, referral_code")
          .eq("user_id", user.id)
          .maybeSingle();
        partnerId = partner?.id;
        referralCode = partner?.referral_code;
      }
    }
  }

  for (const source of ["telegram", "x", "youtube", "whatsapp", "other"]) {
    await test(`create matrix: ${source} + no campaign`, async () => {
      if (!sb || !partnerId || !referralCode) {
        console.log(`  (skipped — no integration fixture)`);
        return;
      }
      process.env.NEXT_PUBLIC_SITE_URL = "www.hasanchartworld.com";
      const result = await createSmartLink(sb, {
        partnerId,
        referralCode,
        tierKey: "partner",
        input: { destinationPath: "/register", source },
      });
      assert.equal(result.ok, true, `${source} should create`);
      assert.match(result.url, /^https:\/\//);
      assert.doesNotMatch(result.url, /\?/);
      assert.match(result.url, /\/r\/[A-Za-z0-9]{6,10}$/);
      assert.ok(result.shortCode);
    });
  }

  if (sb && partnerId) {
    await test("resolveSmartLinkByShortCode returns DB metadata", async () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://www.hasanchartworld.com";
      const created = await createSmartLink(sb, {
        partnerId,
        referralCode,
        tierKey: "partner",
        input: { destinationPath: "/register", source: "whatsapp" },
      });
      assert.equal(created.ok, true);
      const resolved = await resolveSmartLinkByShortCode(sb, created.shortCode);
      assert.equal(resolved.ok, true);
      assert.equal(resolved.source, "whatsapp");
      assert.equal(resolved.destinationPath, "/register");
    });
  }

  console.log(`\nPartner Smart Link UX tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
