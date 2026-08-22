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

function resolveCountryCode(text, options = {}) {
  if (options.countryCode) {
    return String(options.countryCode).trim().toUpperCase();
  }

  const fromFlag = resolveCountryCodeFromFlags(text);
  if (fromFlag) {
    return fromFlag;
  }

  const normalized = normalizeTextForMatching(text);
  if (!normalized) {
    return null;
  }

  const matches = [];
  for (const rule of COUNTRY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      matches.push(rule.code);
    }
  }

  if (matches.includes("DE") || matches.includes("FR")) {
    return matches.find((code) => code === "DE" || code === "FR") || matches[0];
  }

  if (matches.includes("UK")) {
    return "UK";
  }

  if (matches.includes("CH")) {
    return "CH";
  }

  if (matches.includes("RU")) {
    return "RU";
  }

  if (matches.includes("EZ") && !matches.includes("UK") && !matches.includes("US")) {
    return "EZ";
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.includes("US")) {
    return "US";
  }

  return matches[0] || null;
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
  resolveCountryCode,
  countryPrefixForEventKey,
  eventKeyMatchesCountry,
};
