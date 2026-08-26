/**
 * Numeric semantic roles — prevent PRICE_LEVEL rendered as ABSOLUTE_MOVE.
 */

const NUMERIC_ROLES = Object.freeze({
  PRICE_LEVEL: "PRICE_LEVEL",
  ABSOLUTE_MOVE: "ABSOLUTE_MOVE",
  PERCENT_MOVE: "PERCENT_MOVE",
  RATE: "RATE",
  YIELD: "YIELD",
  MARKET_CAP: "MARKET_CAP",
  VOLUME: "VOLUME",
  COUNT: "COUNT",
  DATE: "DATE",
  OTHER: "OTHER",
});

function parseSourceNumbers(rawNumbers = []) {
  return (rawNumbers || [])
    .map((entry) => {
      const raw = String(entry?.raw || entry || "").trim();
      return { raw, entry };
    })
    .filter((n) => n.raw && !/^\d+\s*[bt]$/i.test(n.raw));
}

function classifyNumericRole(raw = "", sourceText = "") {
  const text = String(sourceText || "");
  const token = String(raw || "").trim();
  if (!token) return NUMERIC_ROLES.OTHER;

  const digits = token.replace(/[^\d.]/g, "");
  const escapedDigits = digits.replace(/\./g, "\\.");

  if (/%/.test(token)) return NUMERIC_ROLES.PERCENT_MOVE;

  const daysPattern = new RegExp(`${escapedDigits}\\s*(?:days?|hours?|weeks?|months?)`, "i");
  if (daysPattern.test(text)) return NUMERIC_ROLES.COUNT;

  const movePattern = new RegExp(
    `(?:slides?|falls?|fell|drops?|dropped|lost|gains?|gain|added|adding|rise[sd]?|surge[sd]?|jumps?|soars?|plunges?|tumbles?|declines?|retreats?)\\s+\\$?\\s*${escapedDigits}`,
    "i"
  );
  const moveByPattern = new RegExp(
    `\\$?\\s*${escapedDigits}\\s+(?:slide|fall|drop|gain|rise|surge|jump)`,
    "i"
  );
  if (movePattern.test(text) || moveByPattern.test(text)) {
    return NUMERIC_ROLES.ABSOLUTE_MOVE;
  }

  const percentContext = new RegExp(
    `(?:adding|added|gain(?:ed|s)?|rise[sd]?|surge[sd]?|jumps?|falls?|drops?)\\s+(?:by\\s+)?${escapedDigits}\\s*%`,
    "i"
  );
  if (percentContext.test(text)) return NUMERIC_ROLES.PERCENT_MOVE;

  const priceLevelPattern = new RegExp(
    `(?:at|near|around|approaches?|nears?|trades?\\s+at|traded\\s+at|held?\\s+at|sell(?:s)?\\s+at|holds?|holding|around|above|below|near\\s+a\\s+record)\\s+\\$?\\s*${escapedDigits}`,
    "i"
  );
  const pricePrefix = new RegExp(`\\$\\s*${escapedDigits}`, "i");
  if (priceLevelPattern.test(text) || (pricePrefix.test(text) && !movePattern.test(text))) {
    return NUMERIC_ROLES.PRICE_LEVEL;
  }

  if (/\byield/i.test(text) && /\d/.test(token)) return NUMERIC_ROLES.YIELD;
  if (/\brate/i.test(text) && /\d/.test(token)) return NUMERIC_ROLES.RATE;

  return NUMERIC_ROLES.OTHER;
}

function formatNumberForArabic(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return "";

  const billionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:billion|bn)\b/i);
  if (billionMatch) {
    const num = billionMatch[1].replace(/,/g, "");
    return `${num} مليار دولار`;
  }

  const millionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:million|mn)\b/i);
  if (millionMatch) {
    const num = millionMatch[1].replace(/,/g, "");
    return `${num} مليون دولار`;
  }

  const trillionMatch = text.match(/\$?\s*([\d,.]+)\s*(?:trillion|tn)\b/i);
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

function formatArabicForRole(formatted = "", role = NUMERIC_ROLES.OTHER) {
  if (!formatted) return "";
  if (role === NUMERIC_ROLES.PRICE_LEVEL) {
    if (/^\d[\d,.]*%$/.test(formatted)) return `عند ${formatted}`;
    return `قرب ${formatted}`;
  }
  if (role === NUMERIC_ROLES.PERCENT_MOVE || role === NUMERIC_ROLES.ABSOLUTE_MOVE) {
    return formatted;
  }
  return formatted;
}

function formatMaterialNumbers(facts = {}, evidence = {}, limit = 4) {
  const title = String(evidence.title || "");
  const combined = [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");
  const numbers = parseSourceNumbers(facts.numbers).slice(0, limit * 2);
  const formatted = [];
  const seen = new Set();

  for (const { raw } of numbers) {
    const role = classifyNumericRole(raw, combined);
    const arabic = formatNumberForArabic(raw);
    if (!arabic || seen.has(`${role}:${arabic}`)) continue;

    if (/^\d+$/.test(arabic) && title.match(new RegExp(`\\b${arabic}\\s+of\\b`, "i"))) {
      continue;
    }

    if (/^\d[\d,.]*$/.test(arabic) && !/\$|%/.test(raw) && role === NUMERIC_ROLES.OTHER) {
      continue;
    }

    if (role === NUMERIC_ROLES.COUNT || role === NUMERIC_ROLES.DATE) {
      continue;
    }

    seen.add(`${role}:${arabic}`);
    formatted.push({
      raw,
      role,
      arabic,
      display: formatArabicForRole(arabic, role),
    });
    if (formatted.length >= limit) break;
  }

  return formatted;
}

function hasNumericSemanticRoleMismatch(sourceNumbers = [], outputText = "", sourceText = "") {
  const text = String(outputText || "");
  if (!/بمقدار/u.test(text)) return false;

  const combined = String(sourceText || "");
  for (const entry of parseSourceNumbers(sourceNumbers)) {
    const role = classifyNumericRole(entry.raw, combined);
    const formatted = formatNumberForArabic(entry.raw);
    if (!formatted) continue;
    if (role === NUMERIC_ROLES.PRICE_LEVEL && new RegExp(`بمقدار\\s+${formatted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text)) {
      return { raw: entry.raw, role, formatted };
    }
    const digits = entry.raw.replace(/[^\d.]/g, "");
    if (role === NUMERIC_ROLES.PRICE_LEVEL && digits && new RegExp(`بمقدار\\s+[^\\n]{0,20}${digits}`, "u").test(text)) {
      return { raw: entry.raw, role, formatted };
    }
  }
  return null;
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
    if (/^\d+\s*[bt]$/i.test(raw.trim())) return false;
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

    if (/\bbillion\b|(?:\d+\s*)bn\b/i.test(raw)) {
      const pattern = new RegExp(`${base}\\s*مليار`, "u");
      if (pattern.test(text) && !seen.has(source.normalized)) {
        tokens.push(source);
        seen.add(source.normalized);
        tokens = tokens.filter(
          (token) => !(String(token.normalized) === base && pattern.test(text))
        );
      }
    }
    if (/\$/.test(raw) && new RegExp(`${base}\\s*دولار`, "u").test(text)) {
      if (!seen.has(source.normalized)) {
        tokens.push(source);
        seen.add(source.normalized);
      }
      tokens = tokens.filter(
        (token) => !(String(token.normalized) === base && new RegExp(`${base}\\s*دولار`, "u").test(text))
      );
    }
  }

  return tokens.filter((token) => {
    if (String(token.normalized) === "500" && /s&p\s*500|sp500/i.test(text)) return false;
    return true;
  });
}

module.exports = {
  NUMERIC_ROLES,
  classifyNumericRole,
  formatNumberForArabic,
  formatArabicForRole,
  formatMaterialNumbers,
  hasNumericSemanticRoleMismatch,
  hasNumericUnitMismatch,
  parseSourceNumbers,
  extractSemanticNumericTokens,
  filterMaterialSourceNumbers,
};
