const { splitEditorialSections } = require("../publication-format");
const { stripFooter } = require("./layer1-integrity");
const { matchOfficialInText } = require("./entity-registry");
const { ISSUE_CODES } = require("./reason-codes");

const OFFICIAL_CHANNEL_FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function repairRoleMismatch(body = "", issue = {}) {
  const expectedRole = issue.evidence?.expectedRole;
  if (!expectedRole) return String(body || "");
  return String(body || "").replace(/رئيس\s+الاحتياطي\s+الفيدرالي/gu, expectedRole);
}

function repairUncertaintyUpgrade(body = "") {
  return String(body || "")
    .replace(/سيرتفع/gu, "قد يرتفع")
    .replace(/سينخفض/gu, "قد ينخفض")
    .replace(/سيحدث/gu, "قد يحدث")
    .replace(/أكد/gu, "أشار")
    .replace(/بالتأكيد/gu, "بحسب ما ورد");
}

function repairDuplicateHeadline(body = "", headline = "") {
  const sections = splitEditorialSections(stripFooter(body));
  const canonicalHeadline = headline || sections.headlineLine.replace(/^🚨\s*/u, "").trim();
  const bodyLines = sections.bodyLines.filter(
    (line) => line.replace(/^🚨\s*/u, "").trim() !== canonicalHeadline
  );
  return `🚨 ${canonicalHeadline}\n\n${bodyLines.join("\n\n")}`.trim();
}

function applyDeterministicRepairs(draft = {}, issues = []) {
  let body = stripFooter(draft.body || draft.message || "");
  let headline = draft.headline || splitEditorialSections(body).headlineLine.replace(/^🚨\s*/u, "").trim();
  const applied = [];

  for (const entry of issues) {
    if (!entry.repairable) continue;
    if (entry.code === ISSUE_CODES.ROLE_MISMATCH) {
      body = repairRoleMismatch(body, entry);
      headline = repairRoleMismatch(headline, entry);
      applied.push(entry.code);
    } else if (entry.code === ISSUE_CODES.UNCERTAINTY_UPGRADED) {
      body = repairUncertaintyUpgrade(body);
      applied.push(entry.code);
    } else if (entry.code === ISSUE_CODES.DUPLICATE_HEADLINE) {
      body = repairDuplicateHeadline(body, headline);
      applied.push(entry.code);
    } else if (entry.code === ISSUE_CODES.LANGUAGE_INVALID) {
      body = body
        .split("\n")
        .map((line) => line.replace(/[A-Za-z]{5,}/g, "").trim())
        .filter(Boolean)
        .join("\n");
      applied.push(entry.code);
    }
  }

  if (!body.includes("📢 قناة الأخبار الرسمية")) {
    body = `${body}${OFFICIAL_CHANNEL_FOOTER}`;
  }

  return {
    body,
    headline,
    applied,
  };
}

module.exports = {
  applyDeterministicRepairs,
  repairRoleMismatch,
  repairUncertaintyUpgrade,
};
