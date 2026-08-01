const crypto = require("crypto");
const { buildFedWatchFingerprint } = require("./fedwatch-dedup");
const { normalizeSentence } = require("./repetition");

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function detectTrumpIranEventType(text) {
  const value = String(text || "").toLowerCase();
  if (/strike|ضرب|attack|missile|صواريخ|bomb|قصف/i.test(value)) {
    return "strike";
  }
  if (/talk|negot|محادث|agreement|اتفاق|deal/i.test(value)) {
    return "talks";
  }
  if (/sanction|عقوب/i.test(value)) {
    return "sanctions";
  }
  return "general";
}

function buildTrumpIranFingerprint(facts = {}, post = {}) {
  const text = `${facts.title || ""} ${(facts.detailLines || []).join(" ")} ${post.rawText || ""}`;
  if (!/trump|ترامب/i.test(text) || !/iran|إيران/i.test(text)) {
    return null;
  }

  const eventType = detectTrumpIranEventType(text);
  const primaryLine =
    (facts.detailLines || []).find((line) => /trump|ترامب|iran|إيران/i.test(line)) ||
    facts.title ||
    post.rawText ||
    "";
  const bucket = (post.sourcePublishedAt || "").slice(0, 13) || "unknown-hour";
  const numbers = [...(facts.numbers || []), ...(facts.rawNumbers || [])].slice(0, 3).join("|");

  return {
    key: ["trump-iran", eventType, hashText(normalizeSentence(primaryLine)), bucket, numbers].join("|"),
    eventType,
  };
}

function detectFedOfficialTopic(text) {
  const value = String(text || "").toLowerCase();
  if (/inflation|تضخم/i.test(value)) {
    return "inflation";
  }
  if (/rate|fomc|raise|hike|cut|hold|فائدة|رفع|خفض|تثبيت/i.test(value)) {
    return "rates";
  }
  if (/labor|jobs|employment|nfp|وظائف/i.test(value)) {
    return "labor";
  }
  if (/tight|restrict|تشديد/i.test(value)) {
    return "tightening";
  }
  return "general";
}

function buildFedOfficialStatementFingerprint(facts = {}, post = {}) {
  const text = `${facts.title || ""} ${(facts.detailLines || []).join(" ")} ${post.rawText || ""} ${(facts.entities || []).join(" ")}`;
  if (!/logan|لوغان|powell|باول|hammack|kashkari|fed official|فدرالي/i.test(text)) {
    return null;
  }

  const official = /logan|لوغان/i.test(text)
    ? "logan"
    : /powell|باول/i.test(text)
      ? "powell"
      : /hammack/i.test(text)
        ? "hammack"
        : /kashkari/i.test(text)
          ? "kashkari"
          : "fed-official";

  const topic = detectFedOfficialTopic(text);
  const quote = (facts.detailLines || [])[0] || facts.title || post.rawText || "";
  const bucket = (post.sourcePublishedAt || "").slice(0, 13) || "unknown-hour";

  return {
    key: ["fed-official", official, topic, hashText(normalizeSentence(quote)), bucket].join("|"),
    official,
    topic,
  };
}

function buildPublishFingerprintBundle(candidate = {}) {
  const facts = candidate.facts || {};
  const post = candidate.post || {};
  const parts = [
    candidate.fingerprint,
    candidate.mergeKey,
    facts.canonicalEventKey,
    facts.economicTripleKey,
    buildTrumpIranFingerprint(facts, post)?.key,
    buildFedOfficialStatementFingerprint(facts, post)?.key,
    buildFedWatchFingerprint(post.rawText, facts)?.key,
    candidate.resolvedTitle ? hashText(normalizeSentence(candidate.resolvedTitle)) : null,
  ].filter(Boolean);

  const primary = parts[0] || hashText(`${post.sourceChannel}:${post.sourceMessageId}`);
  return {
    primary,
    composite: parts.join("::") || primary,
    parts,
  };
}

module.exports = {
  buildTrumpIranFingerprint,
  buildFedOfficialStatementFingerprint,
  buildPublishFingerprintBundle,
  detectTrumpIranEventType,
  detectFedOfficialTopic,
};
