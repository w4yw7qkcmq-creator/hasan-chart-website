const { normalizeTextForMatching } = require("./text-normalization");

const COUNTRY_RULES = [
  {
    code: "US",
    patterns: [/🇺🇸|\bus\b|\busa\b|united states|أمريكا|امريكا|الولايات المتحدة|الولايات المتحده|أمريكي|امريكي/i],
  },
  {
    code: "UK",
    patterns: [/🇬🇧|\buk\b|united kingdom|britain|british|إنكلترا|انكلترا|إنجلترا|انجلترا|بريطانيا|المملكة المتحدة|المملكه المتحده|الباوند/i],
  },
  {
    code: "DE",
    patterns: [/🇩🇪|\bde\b|germany|german|ألمانيا|المانيا|الألمان|المان/i],
  },
  {
    code: "FR",
    patterns: [/🇫🇷|\bfr\b|france|french|فرنسا|الفرنس/i],
  },
  {
    code: "EZ",
    patterns: [
      /🇪🇺|eurozone|euro area|euro-area|ecb|european central bank|الاتحاد الأوروبي|الاتحاد الاوروبي|منطقة اليورو|البنك المركزي الأوروبي|المركزي الأوروبي|لاجارد|lagarde/i,
    ],
  },
  {
    code: "CH",
    patterns: [/🇨🇭|\bch\b|switzerland|swiss|swiss national bank|\bsnb\b|سويسرا|سويسري|السويسري/i],
  },
  {
    code: "RU",
    patterns: [/🇷🇺|\bru\b|russia|russian|bank of russia|\bcbr\b|روسيا|روسي|الروسي|بنك روسيا|البنك المركزي الروسي|المركزي الروسي/i],
  },
  {
    code: "CA",
    patterns: [/🇨🇦|\bca\b|canada|canadian|كندا|الكند/i],
  },
  {
    code: "AU",
    patterns: [/🇦🇺|\bau\b|australia|australian|أستراليا|استراليا|الأستر/i],
  },
  {
    code: "JP",
    patterns: [/🇯🇵|\bjp\b|japan|japanese|اليابان|اليان/i],
  },
  {
    code: "CN",
    patterns: [/🇨🇳|\bcn\b|china|chinese|الصين|الصين/i],
  },
];

const FLAG_COUNTRY_CODES = [
  ["🇺🇸", "US"],
  ["🇬🇧", "UK"],
  ["🇩🇪", "DE"],
  ["🇫🇷", "FR"],
  ["🇪🇺", "EZ"],
  ["🇨🇭", "CH"],
  ["🇷🇺", "RU"],
  ["🇨🇦", "CA"],
  ["🇦🇺", "AU"],
  ["🇯🇵", "JP"],
  ["🇨🇳", "CN"],
];

function resolveCountryCodeFromFlags(text) {
  const raw = String(text || "");
  for (const [flag, code] of FLAG_COUNTRY_CODES) {
    if (raw.includes(flag)) {
      return code;
    }
  }
  return null;
}

function flattenCountryText(text) {
  return String(text || "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countrySignalText(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => !/^\s*(?:[^\p{L}\p{N}]{0,6})?النتيجة\b/u.test(line))
    .join("\n");
}

function collectFlagCodes(text) {
  const codes = [];
  for (const [flag, code] of FLAG_COUNTRY_CODES) {
    if (String(text || "").includes(flag)) codes.push(code);
  }
  return [...new Set(codes)];
}

function isExplicitEuropeRegion(text) {
  const raw = String(text || "");
  const lineHeader =
    /(?:^|[\n:：])\s*(?:[^\p{L}\p{N}\n]{0,12})?(?:أوروبا|اوروبا)\s*(?:$|[-–—:：])/gmu;
  if (lineHeader.test(raw)) return true;
  const lineIndicator =
    /(?:^|[\n:：])\s*(?:[^\p{L}\p{N}\n]{0,12})?(?:أوروبا|اوروبا)\s+ل?\s*(?:الناتج|مؤشر|معدل|قرار|بيانات|التضخم|البطالة)/gmu;
  if (lineIndicator.test(raw)) return true;
  const flat = flattenCountryText(raw);
  if (/^(?:أوروبا|اوروبا)$/u.test(flat)) return true;
  const withoutGeographic = flat.replace(
    /(?:في|داخل|عبر|دول|قارة|أسواق|سوق|من)\s*(?:أوروبا|اوروبا)/gu,
    " "
  );
  return /(?:^|\s)(?:أوروبا|اوروبا)\s+ل?\s*(?=الناتج|مؤشر|معدل|قرار|بيانات|التضخم|البطالة)/u.test(
    withoutGeographic
  );
}

function hasSupportiveEuropeContext(text) {
  if (isExplicitEuropeRegion(text)) return false;
  const flat = flattenCountryText(text);
  const withoutGeographic = flat.replace(
    /(?:في|داخل|عبر|دول|قارة|أسواق|سوق|من)\s*(?:أوروبا|اوروبا)/gu,
    " "
  );
  if (!/(?:أوروبا|اوروبا)/u.test(withoutGeographic)) return false;
  const hasContext = /(?:اليورو|يورو|\beur\b|\becb\b|المركزي الأوروبي|منطقة اليورو)/iu.test(flat);
  const hasIndicator = /(?:الناتج|\bgdp\b|مؤشر|التضخم|البطالة)/iu.test(flat);
  return hasContext && hasIndicator;
}

function matchCountryWords(text) {
  const normalized = normalizeTextForMatching(text);
  if (!normalized) return [];
  const matches = [];
  for (const rule of COUNTRY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      matches.push(rule.code);
    }
  }
  return matches;
}

function legacyPick(matches) {
  if (matches.includes("DE") || matches.includes("FR")) {
    return matches.find((code) => code === "DE" || code === "FR") || matches[0];
  }
  if (matches.includes("UK")) return "UK";
  if (matches.includes("CH")) return "CH";
  if (matches.includes("RU")) return "RU";
  if (matches.includes("EZ") && !matches.includes("UK") && !matches.includes("US")) return "EZ";
  if (matches.length === 1) return matches[0];
  if (matches.includes("US")) return "US";
  return matches[0] || null;
}

function resolveCountryResolution(text, options = {}) {
  if (options.countryCode) {
    return {
      countryCode: String(options.countryCode).trim().toUpperCase(),
      status: "resolved",
    };
  }

  const signal = countrySignalText(text);
  const flags = collectFlagCodes(signal);
  const words = matchCountryWords(signal);
  const europeExplicit = isExplicitEuropeRegion(signal);
  const codes = new Set(words);
  for (const flag of flags) codes.add(flag);
  if (europeExplicit || (codes.size === 0 && hasSupportiveEuropeContext(signal))) {
    codes.add("EZ");
  }

  if (codes.size === 0) {
    return { countryCode: null, status: "unknown" };
  }
  if (codes.size === 1) {
    return { countryCode: [...codes][0], status: "resolved" };
  }
  if (europeExplicit || flags.length > 1) {
    return { countryCode: null, status: "ambiguous" };
  }
  if (flags.length === 1) {
    const foreign = [...codes].filter((code) => code !== flags[0]);
    if (foreign.length) {
      return { countryCode: null, status: "ambiguous" };
    }
    return { countryCode: flags[0], status: "resolved" };
  }

  return { countryCode: legacyPick([...codes]), status: "resolved" };
}

function resolveCountryCode(text, options = {}) {
  return resolveCountryResolution(text, options).countryCode;
}

function countryCodeFromOptions(options, text) {
  if (options && Object.prototype.hasOwnProperty.call(options, "countryCode")) {
    return options.countryCode ? String(options.countryCode).trim().toUpperCase() : null;
  }
  return resolveCountryCode(text);
}

function countryPrefixForEventKey(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) {
    return null;
  }
  return `${code}_`;
}

function eventKeyMatchesCountry(eventKey, countryCode) {
  if (!eventKey || !countryCode) {
    return true;
  }
  return String(eventKey).startsWith(`${String(countryCode).toUpperCase()}_`);
}

module.exports = {
  COUNTRY_RULES,
  FLAG_COUNTRY_CODES,
  resolveCountryCodeFromFlags,
  resolveCountryResolution,
  resolveCountryCode,
  countryCodeFromOptions,
  countryPrefixForEventKey,
  eventKeyMatchesCountry,
};
