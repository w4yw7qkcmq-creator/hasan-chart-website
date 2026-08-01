function normalizeSentence(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmpty(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value) {
      continue;
    }
    const key = normalizeSentence(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function removeSemanticRepetition(sections = {}) {
  const headline = String(sections.headline || "").trim();
  let summary = String(sections.summary || "").trim();
  let bullets = uniqueNonEmpty(sections.bullets || []);
  let impact = String(sections.impact || "").trim();

  const headlineNorm = normalizeSentence(headline);
  if (summary && normalizeSentence(summary) === headlineNorm) {
    summary = "";
  }
  if (summary && headlineNorm && normalizeSentence(summary).startsWith(headlineNorm)) {
    summary = summary.slice(headline.length).trim();
  }

  bullets = bullets.filter((bullet) => {
    const b = normalizeSentence(bullet);
    return b !== headlineNorm && (!summary || !normalizeSentence(summary).includes(b));
  });

  if (impact && summary && normalizeSentence(impact) === normalizeSentence(summary)) {
    impact = "";
  }

  return {
    headline,
    summary,
    bullets: bullets.slice(0, 3),
    impact,
  };
}

module.exports = {
  removeSemanticRepetition,
  uniqueNonEmpty,
  normalizeSentence,
};
