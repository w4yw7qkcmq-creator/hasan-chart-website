const OFFICIAL_CHANNEL_FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";
const OFFICIAL_CHANNEL_FOOTER_PATTERN =
  /\n\n📢 قناة الأخبار الرسمية:\nhttps?:\/\/t\.me\/EconomicNewsi\/?\s*$/i;

const LEADING_PRESENTATION_EMOJI =
  /^[\s🚨📌📈📉🔥⚡🛢️💰🇺🇸🇮🇷🔴🟢🟡🎯📊📰⚠️]+/u;

function stripLeadingPresentationEmoji(value = "") {
  return String(value || "")
    .replace(LEADING_PRESENTATION_EMOJI, "")
    .trim();
}

function normalizeHeadlineComparable(value = "") {
  return stripLeadingPresentationEmoji(String(value || ""))
    .replace(/\*\*/g, "")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripOfficialChannelFooter(body = "") {
  return String(body || "").replace(OFFICIAL_CHANNEL_FOOTER_PATTERN, "").trim();
}

function splitEditorialSections(message = "") {
  const withoutFooter = stripOfficialChannelFooter(message);
  const lines = withoutFooter
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headlineLine = lines[0] || "";
  const bodyLines = lines.slice(1);
  return {
    headlineLine,
    bodyLines,
    bodyText: bodyLines.join("\n\n").trim(),
  };
}

function getFirstBodyLine(bodyText = "") {
  return String(bodyText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

function bodyStartsWithEquivalentHeadline(headline = "", bodyText = "") {
  const normalizedHeadline = normalizeHeadlineComparable(headline);
  if (normalizedHeadline.length < 8) {
    return false;
  }
  const normalizedFirstLine = normalizeHeadlineComparable(getFirstBodyLine(bodyText));
  return normalizedHeadline === normalizedFirstLine;
}

function removeLeadingHeadlineFromBody(headline = "", bodyText = "") {
  if (!bodyStartsWithEquivalentHeadline(headline, bodyText)) {
    return String(bodyText || "").trim();
  }
  const lines = String(bodyText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(1).join("\n\n").trim();
}

function ensureOfficialFooter(message = "") {
  const trimmed = String(message || "").trim();
  if (OFFICIAL_CHANNEL_FOOTER_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${OFFICIAL_CHANNEL_FOOTER}`;
}

function buildRssPublicationPresentation({ sourceTitle = "", editorialMessage = "", imageTitle = "" } = {}) {
  const message = String(editorialMessage || "").trim();
  const sections = splitEditorialSections(message);
  const canonicalHeadline = stripLeadingPresentationEmoji(
    imageTitle || sections.headlineLine || sourceTitle || ""
  ).trim();

  let bodyText = sections.bodyText;
  if (!bodyText && sections.headlineLine) {
    bodyText = stripOfficialChannelFooter(message)
      .replace(sections.headlineLine, "")
      .replace(/^\n+/, "")
      .trim();
  }
  bodyText = removeLeadingHeadlineFromBody(canonicalHeadline, bodyText);

  const headlineLine =
    sections.headlineLine && normalizeHeadlineComparable(sections.headlineLine) === normalizeHeadlineComparable(canonicalHeadline)
      ? sections.headlineLine
      : canonicalHeadline
        ? `🚨 ${canonicalHeadline}`
        : sections.headlineLine;

  const telegramMessage = ensureOfficialFooter(
    bodyText ? `${headlineLine}\n\n${bodyText}` : headlineLine
  );

  const siteTitle = canonicalHeadline || stripLeadingPresentationEmoji(headlineLine);
  const siteContent = bodyText ? ensureOfficialFooter(bodyText) : ensureOfficialFooter("");

  const dedupeIdentity = [sourceTitle, canonicalHeadline, bodyText]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    canonicalHeadline,
    imageTitle: canonicalHeadline || imageTitle,
    telegramMessage,
    siteTitle,
    siteContent,
    dedupeIdentity,
  };
}

module.exports = {
  OFFICIAL_CHANNEL_FOOTER,
  OFFICIAL_CHANNEL_FOOTER_PATTERN,
  normalizeHeadlineComparable,
  stripOfficialChannelFooter,
  bodyStartsWithEquivalentHeadline,
  removeLeadingHeadlineFromBody,
  buildRssPublicationPresentation,
};
