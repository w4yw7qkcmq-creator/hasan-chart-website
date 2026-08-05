const { formatDisplayValue, containsForbiddenPlaceholder, parseEconomicNumber } = require("./normalize");

const LTR = "\u2066";
const PDF = "\u2069";

function wrapLtrNumber(value) {
  if (value == null) {
    return null;
  }
  return `${LTR}${value}${PDF}`;
}

function getFieldLabels(canonical) {
  if (canonical?.fieldLabels) {
    return canonical.fieldLabels;
  }

  return {
    previous: "السابق",
    forecast: "المتوقع",
    actual: "الحالي",
  };
}

function getEconomicReleaseImpactText(title, actualValue, forecastValue) {
  const titleText = String(title || "").toLowerCase();
  const actual = parseEconomicNumber(actualValue);
  const forecast = parseEconomicNumber(forecastValue);

  if (actual === null || forecast === null) {
    return "التأثير غير واضح حتى الآن";
  }

  if (actual === forecast) {
    return "مطابق للتوقعات، التأثير محدود غالبًا";
  }

  const actualAboveForecast = actual > forecast;

  if (/jobless claims|initial claims|continuing claims|unemployment claims/i.test(titleText)) {
    return actualAboveForecast
      ? "سلبي للدولار الأمريكي / إيجابي للذهب"
      : "إيجابي للدولار الأمريكي / سلبي للذهب";
  }

  if (/unemployment rate/i.test(titleText)) {
    return actualAboveForecast
      ? "سلبي للدولار الأمريكي / إيجابي للذهب"
      : "إيجابي للدولار الأمريكي / سلبي للذهب";
  }

  if (/cpi|core cpi|ppi|pce|inflation/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي / سلبي للذهب والأسهم"
      : "سلبي للدولار الأمريكي / إيجابي للذهب والأسهم";
  }

  if (/nfp|nonfarm payrolls|payrolls|employment/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي / سلبي للذهب"
      : "سلبي للدولار الأمريكي / إيجابي للذهب";
  }

  if (/consumer confidence|consumer sentiment|retail sales|gdp|pmi|ism|rate decision|interest rate/i.test(titleText)) {
    return actualAboveForecast
      ? "إيجابي للدولار الأمريكي والأسهم / سلبي للذهب"
      : "سلبي للدولار الأمريكي والأسهم / إيجابي للذهب";
  }

  return actualAboveForecast ? "إيجابي للدولار الأمريكي غالبًا" : "سلبي للدولار الأمريكي غالبًا";
}

function formatEconomicReleaseMessage(event, canonical) {
  if (!event) {
    throw new Error("Cannot format economic release without merged event");
  }
  const labels = getFieldLabels(canonical);
  const previous = wrapLtrNumber(formatDisplayValue(event.previous));
  const forecast = wrapLtrNumber(formatDisplayValue(event.forecast));
  const actual = wrapLtrNumber(formatDisplayValue(event.actual));

  if (!previous || !forecast || !actual) {
    throw new Error("Cannot format incomplete economic release");
  }

  const arabicName = canonical.arabicName || event.title || "خبر اقتصادي أمريكي";
  const impact = getEconomicReleaseImpactText(event.title || arabicName, event.actual?.display, event.forecast?.display);

  const message =
    `🟥 صدر الآن :\n\n` +
    `📊 أمريكا - 🇺🇸\n` +
    `💵 ${arabicName}\n\n` +
    `▪️ ${labels.previous} : ${previous}\n` +
    `▪️ ${labels.forecast} : ${forecast}\n` +
    `▫️ ${labels.actual} : ${actual}\n\n` +
    `⬅️ النتيجة : ${impact}\n\n` +
    `📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅`;

  if (containsForbiddenPlaceholder(message)) {
    throw new Error("Formatted message contains forbidden placeholder text");
  }

  return message;
}

function formatPlainEconomicNewsMessage(title, arabicName) {
  const eventName = arabicName || "خبر اقتصادي أمريكي مهم";
  return (
    `🚨 خبر اقتصادي عاجل\n\n` +
    `📊 أمريكا - 🇺🇸\n` +
    `💵 ${eventName}\n\n` +
    `▫️ التفاصيل : ${title}\n\n` +
    `📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅`
  );
}

module.exports = {
  formatEconomicReleaseMessage,
  formatPlainEconomicNewsMessage,
  getEconomicReleaseImpactText,
  containsForbiddenPlaceholder,
};
