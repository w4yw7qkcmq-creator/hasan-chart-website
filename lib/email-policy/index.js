export {
  EMAIL_CONSENT_POLICY_VERSION,
  EMAIL_POLICY_SOURCES,
  EXCLUSION_REASONS,
  EXCLUSION_REASON_LABELS_AR,
  requiresMarketingConsent,
  isServiceAnnouncementCategory,
  isTransactionalCategory,
  formatExclusionReason,
} from "./constants.js";

export {
  evaluateEmailSendPolicy,
  policyToEligibility,
  normalizePolicyEmail,
} from "./evaluate.js";

export {
  countEligibleProfiles,
  getMarketingAudienceAggregateCounts,
  getMarketingConsentPopulationReport,
} from "./audience-metrics.js";
