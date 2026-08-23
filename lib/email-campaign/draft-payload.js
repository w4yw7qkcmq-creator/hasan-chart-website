/**
 * Pure helpers for campaign draft PATCH payloads — keep partial updates explicit.
 */

export function resolveEffectiveCampaignName({ formName, campaignName } = {}) {
  const fromForm = String(formName ?? "").trim();
  if (fromForm) return fromForm;
  return String(campaignName ?? "").trim();
}

/**
 * Server-side / shared rule: empty name in PATCH must not wipe persisted name.
 */
export function resolveCampaignNamePatch(existingName, patchName) {
  if (patchName === undefined) {
    return { action: "omit" };
  }

  const nextName = String(patchName || "").trim();
  const persistedName = String(existingName || "").trim();

  if (!nextName) {
    if (persistedName) {
      return { action: "preserve", value: persistedName };
    }
    return { action: "reject", error: "اسم الحملة مطلوب" };
  }

  return { action: "set", value: nextName };
}

/** Message save — never sends empty name; omits name when unchanged on server. */
export function buildMessageDraftPatch({
  subject,
  previewText,
  htmlContent,
  formName,
  campaignName,
} = {}) {
  const patch = {
    subject,
    previewText,
    htmlContent,
  };

  const effectiveName = resolveEffectiveCampaignName({ formName, campaignName });
  const persistedName = String(campaignName || "").trim();
  if (effectiveName && effectiveName !== persistedName) {
    patch.name = effectiveName;
  }

  return patch;
}

/** Audience/create save — name is required when creating or updating audience step. */
export function buildAudienceDraftPatch({
  name,
  subject,
  previewText,
  htmlContent,
  audienceType,
  audienceFilter,
  includeAudienceFields = true,
} = {}) {
  const effectiveName = String(name || "").trim();
  if (!effectiveName) {
    throw new Error("اسم الحملة مطلوب");
  }

  const patch = {
    name: effectiveName,
    subject,
    previewText,
    htmlContent,
  };

  if (includeAudienceFields) {
    patch.audienceType = audienceType;
    patch.audienceFilter = audienceFilter;
  }

  return patch;
}

export function localizeCampaignApiError(message) {
  const text = String(message || "").trim();
  if (text === "Campaign name is required") {
    return "اسم الحملة مطلوب — أدخل اسمًا داخليًا للحملة قبل المتابعة.";
  }
  return text || "تعذر حفظ الحملة";
}
