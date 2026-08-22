import { createRequire } from "node:module";
import {
  EMAIL_CATEGORIES,
  isBulkEmailCategory,
  normalizeEmailCategory,
} from "../email-categories.js";
import { getActiveSuppression, isHardSuppressionReason } from "../email-suppression.js";
import { isMarketingEmailAllowed } from "../email-marketing-preferences.js";
import {
  EXCLUSION_REASONS,
  isServiceAnnouncementCategory,
  requiresMarketingConsent,
} from "./constants.js";

const require = createRequire(import.meta.url);
const { blockProductionTestRecipientSend } = require("../email-recipient-guard.cjs");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePolicyEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmailFormat(email) {
  return EMAIL_PATTERN.test(normalizePolicyEmail(email));
}

/**
 * Central server-side email send policy.
 * Backend is source of truth — clients cannot spoof category to bypass consent.
 */
export async function evaluateEmailSendPolicy(
  supabase,
  {
    userId = null,
    email = null,
    category = EMAIL_CATEGORIES.TRANSACTIONAL,
    messageType = null,
    context = {},
    requireVerifiedEmail = false,
  } = {},
  deps = {}
) {
  const normalizedEmail = normalizePolicyEmail(email);
  const normalizedCategory = normalizeEmailCategory(category);
  const checkSuppressionFn = deps.getActiveSuppression || getActiveSuppression;
  const marketingAllowedFn = deps.isMarketingEmailAllowed || isMarketingEmailAllowed;

  const base = {
    allowed: false,
    normalizedEmail,
    category: normalizedCategory,
    reason: null,
    consentRequired: requiresMarketingConsent(normalizedCategory),
    consentSatisfied: false,
    suppressed: false,
    suppressionType: null,
    suppressionReason: null,
    messageType,
    context: context && typeof context === "object" ? context : {},
  };

  if (!normalizedEmail) {
    return { ...base, reason: EXCLUSION_REASONS.MISSING_EMAIL };
  }

  if (!isValidEmailFormat(normalizedEmail)) {
    return { ...base, reason: EXCLUSION_REASONS.INVALID_EMAIL_FORMAT };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: "lib/email-policy/evaluate.js::evaluateEmailSendPolicy",
    to: normalizedEmail,
  });

  if (recipientBlocked) {
    return {
      ...base,
      reason: recipientBlocked.reason || EXCLUSION_REASONS.PRODUCTION_RECIPIENT_BLOCKED,
    };
  }

  if (supabase) {
    const suppression = await checkSuppressionFn(supabase, normalizedEmail);
    if (suppression?.reason) {
      const hard = isHardSuppressionReason(suppression.reason);
      const appliesToCategory =
        isBulkEmailCategory(normalizedCategory) ||
        isServiceAnnouncementCategory(normalizedCategory) ||
        normalizedCategory === EMAIL_CATEGORIES.TRANSACTIONAL;

      if (appliesToCategory && hard) {
        return {
          ...base,
          reason: EXCLUSION_REASONS.HARD_SUPPRESSED,
          suppressed: true,
          suppressionType: "hard",
          suppressionReason: suppression.reason,
        };
      }
    }
  }

  if (requiresMarketingConsent(normalizedCategory) && supabase) {
    const marketing = await marketingAllowedFn(supabase, {
      userId,
      email: normalizedEmail,
    });

    if (!marketing.allowed) {
      const reason =
        marketing.reason === "global-unsubscribed"
          ? EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED
          : marketing.reason === "marketing-not-opted-in"
            ? EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN
            : marketing.reason === "unknown-user"
              ? EXCLUSION_REASONS.UNKNOWN_USER
              : EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN;

      return {
        ...base,
        reason,
        consentSatisfied: false,
        suppressed: reason === EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED,
        suppressionType:
          reason === EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED ? "marketing" : null,
      };
    }

    base.consentSatisfied = true;

    if (supabase) {
      const suppression = await checkSuppressionFn(supabase, normalizedEmail);
      if (suppression?.reason && isHardSuppressionReason(suppression.reason)) {
        return {
          ...base,
          reason: EXCLUSION_REASONS.HARD_SUPPRESSED,
          consentSatisfied: true,
          suppressed: true,
          suppressionType: "hard",
          suppressionReason: suppression.reason,
        };
      }
    }
  } else if (isServiceAnnouncementCategory(normalizedCategory)) {
    base.consentRequired = false;
    base.consentSatisfied = true;
  } else if (normalizedCategory === EMAIL_CATEGORIES.TRANSACTIONAL) {
    base.consentRequired = false;
    base.consentSatisfied = true;
  }

  if (requireVerifiedEmail && supabase && userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return { ...base, reason: EXCLUSION_REASONS.PROFILE_LOOKUP_FAILED };
    }

    if (!data?.email) {
      return { ...base, reason: EXCLUSION_REASONS.MISSING_PROFILE_EMAIL };
    }
  }

  return {
    ...base,
    allowed: true,
    reason: null,
  };
}

/** Map policy result to legacy eligibility shape used by campaign snapshot. */
export function policyToEligibility(policy) {
  return {
    eligible: policy.allowed === true,
    reason: policy.reason,
    normalizedEmail: policy.normalizedEmail,
    category: policy.category,
    messageType: policy.messageType,
    consentRequired: policy.consentRequired,
    consentSatisfied: policy.consentSatisfied,
    suppressed: policy.suppressed,
    suppressionType: policy.suppressionType,
  };
}
