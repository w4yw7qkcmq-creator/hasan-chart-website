import { createRequire } from "node:module";
import { EMAIL_CATEGORIES, isBulkEmailCategory, normalizeEmailCategory } from "./email-categories.js";
import { isEmailSuppressed } from "./email-suppression.js";
import { isMarketingEmailAllowed } from "./email-marketing-preferences.js";

const require = createRequire(import.meta.url);
const { blockProductionTestRecipientSend } = require("./email-recipient-guard.cjs");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipientEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmailFormat(email) {
  return EMAIL_PATTERN.test(normalizeRecipientEmail(email));
}

export async function evaluateEmailRecipient(
  supabase,
  {
    userId = null,
    email = null,
    category = EMAIL_CATEGORIES.TRANSACTIONAL,
    messageType = null,
    requireVerifiedEmail = false,
  } = {},
  deps = {}
) {
  const normalizedEmail = normalizeRecipientEmail(email);
  const normalizedCategory = normalizeEmailCategory(category);
  const checkSuppressionFn = deps.isEmailSuppressed || isEmailSuppressed;
  const marketingAllowedFn = deps.isMarketingEmailAllowed || isMarketingEmailAllowed;

  if (!normalizedEmail) {
    return {
      eligible: false,
      reason: "missing-email",
      normalizedEmail: "",
      category: normalizedCategory,
      messageType,
    };
  }

  if (!isValidEmailFormat(normalizedEmail)) {
    return {
      eligible: false,
      reason: "invalid-email-format",
      normalizedEmail,
      category: normalizedCategory,
      messageType,
    };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: "lib/email-recipient-eligibility.js::evaluateEmailRecipient",
    to: normalizedEmail,
  });

  if (recipientBlocked) {
    return {
      eligible: false,
      reason: recipientBlocked.reason || "production-recipient-blocked",
      normalizedEmail,
      category: normalizedCategory,
      messageType,
    };
  }

  if (supabase) {
    const suppressed = await checkSuppressionFn(supabase, normalizedEmail);
    if (suppressed) {
      const appliesToCategory =
        isBulkEmailCategory(normalizedCategory) ||
        normalizedCategory === EMAIL_CATEGORIES.TRANSACTIONAL;

      if (appliesToCategory) {
        return {
          eligible: false,
          reason: "suppressed",
          normalizedEmail,
          category: normalizedCategory,
          messageType,
        };
      }
    }
  }

  if (isBulkEmailCategory(normalizedCategory) && supabase) {
    const marketing = await marketingAllowedFn(supabase, {
      userId,
      email: normalizedEmail,
    });

    if (!marketing.allowed) {
      return {
        eligible: false,
        reason: marketing.reason || "marketing-not-allowed",
        normalizedEmail,
        category: normalizedCategory,
        messageType,
      };
    }
  }

  if (requireVerifiedEmail && supabase && userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return {
        eligible: false,
        reason: "profile-lookup-failed",
        normalizedEmail,
        category: normalizedCategory,
        messageType,
      };
    }

    if (!data?.email) {
      return {
        eligible: false,
        reason: "missing-profile-email",
        normalizedEmail,
        category: normalizedCategory,
        messageType,
      };
    }
  }

  return {
    eligible: true,
    reason: null,
    normalizedEmail,
    category: normalizedCategory,
    messageType,
  };
}
