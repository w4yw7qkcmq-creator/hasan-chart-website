import { CAMPAIGN_STATUS } from "./constants.js";
import { normalizeAudienceFilter } from "./audience.js";

const SNAPSHOT_FIELDS = ["audience_type", "audience_filter"];

export function buildCampaignSnapshotFingerprint(campaign) {
  const audienceType = String(campaign?.audience_type || "all_eligible").trim();
  const audienceFilter = normalizeAudienceFilter(audienceType, campaign?.audience_filter || {});
  return JSON.stringify({ audienceType, audienceFilter });
}

export function isCampaignMessageComplete(campaign) {
  const subject = String(campaign?.subject || "").trim();
  const htmlContent = String(campaign?.html_content || "").trim();
  return Boolean(subject && htmlContent);
}

export function deriveAudiencePreparedState(campaign) {
  const status = String(campaign?.status || "").trim();
  const snapshotAt = campaign?.metadata?.snapshotAt || null;
  const snapshotStaleFlag = campaign?.metadata?.audienceSnapshotStale === true;
  const snapshotMatches = campaignContentMatchesSnapshot(campaign);
  const audiencePrepared =
    Boolean(snapshotAt) &&
    (status === CAMPAIGN_STATUS.READY || status === CAMPAIGN_STATUS.PAUSED) &&
    !snapshotStaleFlag &&
    snapshotMatches;

  const audienceStale =
    snapshotStaleFlag || (Boolean(snapshotAt) && !snapshotMatches);

  return { audiencePrepared, audienceStale, snapshotAt, snapshotMatches, status };
}

export function campaignContentMatchesSnapshot(campaign) {
  const stored = campaign?.metadata?.snapshotContentFingerprint;
  if (!stored) {
    // Campaigns prepared before fingerprint rollout: honor existing snapshot timestamp.
    return Boolean(campaign?.metadata?.snapshotAt);
  }
  return stored === buildCampaignSnapshotFingerprint(campaign);
}

export function getAudienceStatsFromCampaign(campaign) {
  const fromMeta = campaign?.metadata?.audienceStats;
  if (fromMeta && typeof fromMeta === "object") {
    return fromMeta;
  }
  const eligible = Number(campaign?.eligible_count) || 0;
  const excluded = Math.max(0, Number(campaign?.audience_snapshot_count) || 0) - eligible;
  return {
    eligible,
    excluded,
    initial: Number(campaign?.audience_snapshot_count) || 0,
  };
}

/**
 * Canonical server-side launch readiness for email campaigns.
 * Client should mirror these semantics; server enforces on launch.
 */
export function getCampaignLaunchReadiness(campaign) {
  const blockers = [];
  const warnings = [];

  if (!campaign) {
    blockers.push({
      code: "campaign_missing",
      title: "لا توجد حملة",
      message: "احفظ مسودة الحملة أولًا قبل المتابعة.",
    });
    return { ready: false, blockers, warnings, eligibleCount: 0, excludedCount: 0 };
  }

  const name = String(campaign.name || "").trim();
  const subject = String(campaign.subject || "").trim();
  const htmlContent = String(campaign.html_content || "").trim();
  const eligibleCount = Number(campaign.eligible_count) || 0;
  const audienceStats = getAudienceStatsFromCampaign(campaign);
  const excludedCount = Number(audienceStats.excluded) || 0;
  const { audiencePrepared, audienceStale, snapshotAt, status } = deriveAudiencePreparedState(campaign);

  if (!name) {
    blockers.push({
      code: "missing_name",
      title: "اسم الحملة غير مكتمل",
      message: "أدخل اسمًا داخليًا للحملة.",
      field: "name",
    });
  }

  if (!subject) {
    blockers.push({
      code: "missing_subject",
      title: "الرسالة غير مكتملة",
      message: "أضف عنوان البريد قبل بدء الإرسال.",
      field: "subject",
    });
  }

  if (!htmlContent) {
    blockers.push({
      code: "missing_content",
      title: "الرسالة غير مكتملة",
      message: "أضف محتوى الرسالة قبل بدء الإرسال.",
      field: "htmlContent",
    });
  }

  if (String(campaign.category || "marketing").toLowerCase() !== "marketing") {
    blockers.push({
      code: "invalid_category",
      title: "سياسة التسويق",
      message: "الحملات الجماعية يجب أن تكون ضمن فئة التسويق.",
    });
  }

  if (!snapshotAt || audienceStale) {
    if (audienceStale) {
      blockers.push({
        code: "snapshot_stale",
        title: "يجب إعادة تجهيز الجمهور",
        message: "تم تعديل إعدادات الجمهور بعد آخر تجهيز. أعد تجهيز الجمهور قبل الإرسال.",
        action: "reprepare_audience",
      });
    } else {
      blockers.push({
        code: "audience_not_prepared",
        title: "لا يمكن بدء الحملة",
        message: "يجب تجهيز الجمهور قبل بدء الإرسال.",
        action: "go_to_audience",
      });
    }
  } else if (status !== CAMPAIGN_STATUS.READY && status !== CAMPAIGN_STATUS.PAUSED) {
    blockers.push({
      code: "invalid_status",
      title: "حالة الحملة غير مناسبة",
      message: `لا يمكن الإطلاق من الحالة «${status}».`,
    });
  }

  if (audiencePrepared && eligibleCount <= 0) {
    blockers.push({
      code: "zero_eligible",
      title: "لا يوجد مستلمون مؤهلون",
      message:
        "الجمهور المحدد لا يحتوي حاليًا على مستخدمين مؤهلين لاستقبال الرسائل التسويقية.",
    });
  }

  if (audiencePrepared && eligibleCount > 0 && eligibleCount < 5) {
    warnings.push({
      code: "small_audience",
      title: "جمهور صغير",
      message: `سيتم الإرسال إلى ${eligibleCount} مستخدم مؤهل فقط.`,
    });
  }

  const ready = blockers.length === 0;

  return {
    ready,
    blockers,
    warnings,
    eligibleCount,
    excludedCount,
    audiencePrepared,
    audienceStale,
    snapshotAt,
    status,
    audienceStats,
  };
}

/**
 * Wizard transition readiness — server source of truth for compose steps.
 * confirmationReady != launchReady (confirmation may show launch blockers).
 */
export function getCampaignWizardReadiness(campaign) {
  const launch = getCampaignLaunchReadiness(campaign);
  const messageComplete = isCampaignMessageComplete(campaign);
  const confirmationBlockers = [];

  if (!campaign?.id) {
    confirmationBlockers.push({
      code: "campaign_missing",
      title: "لا توجد حملة",
      message: "احفظ مسودة الحملة أولًا قبل المتابعة.",
    });
  }

  if (campaign?.id && !launch.audiencePrepared) {
    if (launch.audienceStale) {
      confirmationBlockers.push({
        code: "snapshot_stale",
        title: "يجب إعادة تجهيز الجمهور",
        message: "تم تعديل إعدادات الجمهور بعد آخر تجهيز. أعد تجهيز الجمهور قبل المتابعة.",
        action: "reprepare_audience",
      });
    } else {
      confirmationBlockers.push({
        code: "audience_not_prepared",
        title: "الجمهور غير مجهز",
        message: "يجب تجهيز الجمهور قبل الانتقال للتأكيد.",
        action: "go_to_audience",
      });
    }
  }

  if (campaign?.id && !messageComplete) {
    confirmationBlockers.push({
      code: "message_incomplete",
      title: "الرسالة غير مكتملة",
      message: "أدخل عنوان البريد ومحتوى الرسالة واحفظهما قبل المتابعة.",
      action: "go_to_message",
      field: "subject",
    });
  }

  const confirmationReady = confirmationBlockers.length === 0;
  const previewReady = Boolean(campaign?.id && launch.audiencePrepared && messageComplete);

  const steps = {
    audience: launch.audienceStale
      ? "needs_review"
      : launch.audiencePrepared
        ? "complete"
        : "incomplete",
    message: messageComplete ? "complete" : "incomplete",
    preview: previewReady ? "complete" : "incomplete",
    confirmation: confirmationReady ? "available" : "blocked",
  };

  return {
    ...launch,
    campaignExists: Boolean(campaign?.id),
    messageComplete,
    previewReady,
    confirmationReady,
    launchReady: launch.ready,
    confirmationBlockers,
    steps,
  };
}

export function campaignPatchInvalidatesSnapshot(existing, patch = {}) {
  if (!existing?.metadata?.snapshotAt) return false;

  const nextAudienceType =
    patch.audienceType !== undefined
      ? String(patch.audienceType || "").trim()
      : String(existing.audience_type || "all_eligible").trim();
  const nextAudienceFilter =
    patch.audienceFilter !== undefined ? patch.audienceFilter : existing.audience_filter;

  if (patch.audienceType !== undefined || patch.audienceFilter !== undefined) {
    const draft = {
      ...existing,
      audience_type: nextAudienceType,
      audience_filter: nextAudienceFilter,
    };
    const storedFingerprint =
      existing.metadata?.snapshotContentFingerprint || buildCampaignSnapshotFingerprint(existing);
    if (buildCampaignSnapshotFingerprint(draft) !== storedFingerprint) {
      return true;
    }
  }

  return false;
}

export { SNAPSHOT_FIELDS };
