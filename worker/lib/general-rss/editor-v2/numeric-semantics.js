/**
 * Preserve human-readable numeric units for Arabic fallback output.
 */

function parseSourceNumbers(rawNumbers = []) {
  return (rawNumbers || []).map((entry) => {
    const raw = String(entry?.raw || entry || "").trim();
    return { raw, entry };
  }).filter((n) => n.raw);
}

function formatNumberForArabic(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return "";

  const billionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:billion|bn|b)\b/i);
  if (billionMatch) {
    const num = billionMatch[1].replace(/,/g, "");
    return `${num} مليار دولار`;
  }

  const millionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:million|mn|m)\b/i);
  if (millionMatch) {
    const num = millionMatch[1].replace(/,/g, "");
    return `${num} مليون دولار`;
  }

  const trillionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:trillion|tn|t)\b/i);
  if (trillionMatch) {
    const num = trillionMatch[1].replace(/,/g, "");
    return `${num} تريليون دولار`;
  }

  const dollarMatch = text.match(/\$\s*([\d,.]+)/);
  if (dollarMatch) {
    const num = dollarMatch[1].replace(/,/g, "");
    return `${num} دولار`;
  }

  const pctMatch = text.match(/([\d,.]+)\s*%/);
  if (pctMatch) {
    return `${pctMatch[1].replace(/,/g, "")}%`;
  }

  const plain = text.replace(/^\$/, "").replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(plain)) return plain;

  return text;
}

function formatMaterialNumbers(facts = {}, evidence = {}, limit = 4) {
  const title = String(evidence.title || "");
  const numbers = parseSourceNumbers(facts.numbers).slice(0, limit * 2);
  const formatted = [];
  const seen = new Set();

  for (const { raw } of numbers) {
    const arabic = formatNumberForArabic(raw);
    if (!arabic || seen.has(arabic)) continue;

    if (/^\d+$/.test(arabic) && title.match(new RegExp(`\\b${arabic}\\s+of\\b`, "i"))) {
      continue;
    }

    seen.add(arabic);
    formatted.push(arabic);
    if (formatted.length >= limit) break;
  }

  return formatted;
}

function hasNumericUnitMismatch(sourceNumbers = [], outputText = "") {
  const text = String(outputText || "");
  for (const { raw, entry } of parseSourceNumbers(sourceNumbers)) {
    const token = entry?.value != null ? entry : null;
    if (/\$\s*[\d,.]+/.test(raw) && !/\bdollar|دولار|\$/i.test(text)) {
      const num = raw.replace(/[^\d.]/g, "");
      if (num && text.includes(num) && !/دولار|dollar/i.test(text)) {
        return true;
      }
    }
    if (/\bbillion\b/i.test(raw) && !/مليار/i.test(text)) {
      const num = raw.match(/[\d,.]+/)?.[0]?.replace(/,/g, "");
      if (num && text.includes(num) && !/مليار/i.test(text)) return true;
    }
    if (token && /\bbillion\b|(?:\d+\s*)b\b/i.test(raw) && /مليار/i.test(text)) {
      const base = String(raw).match(/([\d,.]+)/)?.[1]?.replace(/,/g, "");
      if (base && text.includes(`${base} مليار`)) continue;
    }
  }
  return false;
}

function filterMaterialSourceNumbers(sourceNumbers = [], sourceCombined = "") {
  const combined = String(sourceCombined || "");
  return (sourceNumbers || []).filter((entry) => {
    const raw = String(entry.raw || entry || "");
    if (/s&p\s*500|sp500/i.test(combined) && /^500\s*[bt]$/i.test(raw.trim())) return false;
    if (/^500\s*[bt]$/i.test(raw.trim())) return false;
    return true;
  });
}

function extractSemanticNumericTokens(text = "", sourceNumbers = []) {
  const { extractNumericTokens } = require("../external-news-editor/numeric-utils");
  let tokens = extractNumericTokens(text);
  const seen = new Set(tokens.map((t) => t.normalized));

  for (const source of sourceNumbers || []) {
    const raw = String(source.raw || source || "");
    const base = raw.match(/([\d,.]+)/)?.[1]?.replace(/,/g, "");
    if (!base) continue;

    if (/\bbillion\b|(?:\d+\s*)b\b/i.test(raw)) {
      const pattern = new RegExp(`${base}\\s*مليار`, "u");
      if (pattern.test(text) && !seen.has(source.normalized)) {
        tokens.push(source);
        seen.add(source.normalized);
        tokens = tokens.filter(
          (token) =>
            !(String(token.normalized) === base && pattern.test(text))
        );
      }
    }
    if (/\$/.test(raw) && new RegExp(`${base}\\s*دولار`, "u").test(text)) {
      if (!seen.has(source.normalized)) {
        tokens.push(source);
        seen.add(source.normalized);
      }
      tokens = tokens.filter(
        (token) =>
          !(String(token.normalized) === base && new RegExp(`${base}\\s*دولار`, "u").test(text))
      );
    }
  }

  return tokens.filter((token) => {
    if (String(token.normalized) === "500" && /s&p\s*500|sp500/i.test(text)) return false;
    return true;
  });
}

module.exports = {
  formatNumberForArabic,
  formatMaterialNumbers,
  hasNumericUnitMismatch,
  parseSourceNumbers,
  extractSemanticNumericTokens,
  filterMaterialSourceNumbers,
};
