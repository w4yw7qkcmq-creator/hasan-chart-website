function auditRssPostPublish(input = {}) {
  const issues = [];
  const warnings = [];

  if (!input.sourceLink) {
    warnings.push("missing_source_link");
  }

  if (input.telegramSent && input.siteInserted === false) {
    issues.push("site_delivery_missing");
  }

  if (input.siteInserted && input.telegramSent === false) {
    warnings.push("telegram_delivery_missing");
  }

  if (input.expectedTitle && input.savedTitle && input.expectedTitle !== input.savedTitle) {
    warnings.push("title_parity_mismatch");
  }

  if (input.expectedImageUrl && !input.savedImageUrl) {
    warnings.push("image_url_missing_on_site");
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

module.exports = {
  auditRssPostPublish,
};
