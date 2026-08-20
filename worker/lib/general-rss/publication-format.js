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
    .replace(/[.:،؛!?؟-]+/g, " ")
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

function removeAllEquivalentHeadlineLines(headline = "", bodyText = "") {
  const normalizedHeadline = normalizeHeadlineComparable(headline);
  if (normalizedHeadline.length < 8) {
    return String(bodyText || "").trim();
  }
  const lines = String(bodyText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter((line) => normalizeHeadlineComparable(line) !== normalizedHeadline)
    .join("\n\n")
    .trim();
}

function collapseRepeatedNormalizedPhrase(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const segments = raw
    .split(/\s*(?:⚠️|🚨|📌|🔥|📈|📉)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    const firstNormalized = normalizeHeadlineComparable(segments[0]);
    if (firstNormalized.length >= 8) {
      const allEquivalent = segments.every(
        (segment) => normalizeHeadlineComparable(segment) === firstNormalized
      );
      if (allEquivalent) {
        return segments[0];
      }
    }
  }

  const normalizedFull = normalizeHeadlineComparable(raw);
  if (normalizedFull.length >= 16) {
    const half = Math.floor(normalizedFull.length / 2);
    const firstHalf = normalizedFull.slice(0, half).trim();
    const secondHalf = normalizedFull.slice(half).trim();
    if (firstHalf.length >= 8 && firstHalf === secondHalf) {
      const words = raw.split(/\s+/);
      const midpoint = Math.ceil(words.length / 2);
      const firstPart = normalizeHeadlineComparable(words.slice(0, midpoint).join(" "));
      const secondPart = normalizeHeadlineComparable(words.slice(midpoint).join(" "));
      if (firstPart.length >= 8 && firstPart === secondPart) {
        return words.slice(0, midpoint).join(" ").trim();
      }
    }
  }

  return raw;
}

function resolveCanonicalHeadline({ sourceTitle = "", imageTitle = "", headlineLine = "" } = {}) {
  const editorialHeadline = collapseRepeatedNormalizedPhrase(
    stripLeadingPresentationEmoji(imageTitle || headlineLine || "")
  ).trim();

  if (editorialHeadline && normalizeHeadlineComparable(editorialHeadline).length >= 8) {
    return editorialHeadline;
  }

  return collapseRepeatedNormalizedPhrase(stripLeadingPresentationEmoji(sourceTitle || "")).trim();
}

function headlineLineContainsSourceTitle(sourceTitle = "", headlineLine = "") {
  const normalizedSource = normalizeHeadlineComparable(sourceTitle);
  const normalizedHeadline = normalizeHeadlineComparable(headlineLine);
  if (!normalizedSource || normalizedSource.length < 8) {
    return false;
  }
  return normalizedHeadline.includes(normalizedSource);
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
  const canonicalHeadline = resolveCanonicalHeadline({
    sourceTitle,
    imageTitle,
    headlineLine: sections.headlineLine,
  });

  let bodyText = sections.bodyText;
  if (!bodyText && sections.headlineLine) {
    bodyText = stripOfficialChannelFooter(message)
      .replace(sections.headlineLine, "")
      .replace(/^\n+/, "")
      .trim();
  }
  bodyText = removeLeadingHeadlineFromBody(canonicalHeadline, bodyText);
  bodyText = removeAllEquivalentHeadlineLines(canonicalHeadline, bodyText);

  const headlineLine =
    canonicalHeadline && normalizeHeadlineComparable(canonicalHeadline).length >= 8
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
    sourceTitleEmbeddedInHeadline: headlineLineContainsSourceTitle(sourceTitle, sections.headlineLine),
  };
}

module.exports = {
  OFFICIAL_CHANNEL_FOOTER,
  OFFICIAL_CHANNEL_FOOTER_PATTERN,
  normalizeHeadlineComparable,
  stripOfficialChannelFooter,
  bodyStartsWithEquivalentHeadline,
  removeLeadingHeadlineFromBody,
  removeAllEquivalentHeadlineLines,
  collapseRepeatedNormalizedPhrase,
  resolveCanonicalHeadline,
  buildRssPublicationPresentation,
};
