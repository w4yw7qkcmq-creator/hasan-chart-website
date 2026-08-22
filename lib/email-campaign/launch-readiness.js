import { CAMPAIGN_STATUS } from "./constants.js";

const SNAPSHOT_FIELDS = ["audience_type", "audience_filter", "subject", "preview_text", "html_content"];

export function buildCampaignSnapshotFingerprint(campaign) {
  const payload = {
    audienceType: campaign?.audience_type || "all_eligible",
    audienceFilter: campaign?.audience_filter || {},
  };
  return JSON.stringify(payload);
}

export function campaignContentMatchesSnapshot(campaign) {
  const stored = campaign?.metadata?.snapshotContentFingerprint;
  if (!stored) return false;
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
  const status = String(campaign.status || "").trim();
  const eligibleCount = Number(campaign.eligible_count) || 0;
  const audienceStats = getAudienceStatsFromCampaign(campaign);
  const excludedCount = Number(audienceStats.excluded) || 0;
  const snapshotAt = campaign.metadata?.snapshotAt || null;
  const snapshotStaleFlag = campaign.metadata?.audienceSnapshotStale === true;
  const snapshotMatches = campaignContentMatchesSnapshot(campaign);
  const audiencePrepared =
    Boolean(snapshotAt) &&
    (status === CAMPAIGN_STATUS.READY || status === CAMPAIGN_STATUS.PAUSED) &&
    !snapshotStaleFlag &&
    snapshotMatches;

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

  if (!snapshotAt || snapshotStaleFlag || !snapshotMatches) {
    if (snapshotStaleFlag || (snapshotAt && !snapshotMatches)) {
      blockers.push({
        code: "snapshot_stale",
        title: "يجب إعادة تجهيز الجمهور",
        message: "تم تعديل الجمهور أو الرسالة بعد آخر تجهيز. أعد تجهيز الجمهور قبل الإرسال.",
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
    snapshotAt,
    status,
    audienceStats,
  };
}

export function campaignPatchInvalidatesSnapshot(existing, patch = {}) {
  if (!existing?.metadata?.snapshotAt) return false;

  for (const key of ["audienceType", "audienceFilter"]) {
    if (patch[key] !== undefined) {
      const draft = {
        ...existing,
        audience_type: patch.audienceType ?? existing.audience_type,
        audience_filter: patch.audienceFilter ?? existing.audience_filter,
      };
      if (buildCampaignSnapshotFingerprint(draft) !== existing.metadata?.snapshotContentFingerprint) {
        return true;
      }
    }
  }

  return false;
}

export { SNAPSHOT_FIELDS };
