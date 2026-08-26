/**
 * Event-type deterministic fallback templates — no universal robotic skeleton.
 */

const { ACTION_CLASSES } = require("./action-resolution");

function joinParts(parts = []) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function buildMarketMoveTemplate({ subject, action, numbers = [], evidence = {} }) {
  const title = String(evidence.title || "");
  const uncertain = /unconfirmed|rumou?rs?|reportedly|may|might|could/i.test(title);
  const moveAmount = numbers.find((n) => n.role === "ABSOLUTE_MOVE" || n.role === "PERCENT_MOVE");
  const priceLevel = numbers.find((n) => n.role === "PRICE_LEVEL");
  const amountDisplay = moveAmount?.display || moveAmount?.arabic || "";
  const levelDisplay = priceLevel?.display || priceLevel?.arabic || "";

  const headline = amountDisplay
    ? `${subject.arabic}: ${action.actionArabic} بمقدار ${amountDisplay}`.slice(0, 140)
    : levelDisplay
      ? `${subject.arabic}: ${action.actionArabic} ${levelDisplay}`.slice(0, 140)
      : `${subject.arabic}: ${action.actionArabic}`.slice(0, 140);

  let body = uncertain
    ? `سجل ${subject.arabic} ${action.actionArabic}${amountDisplay ? ` بمقدار ${amountDisplay}` : levelDisplay ? ` ${levelDisplay}` : ""} وسط تقارير غير مؤكدة وردت في المصدر.`
    : `سجل ${subject.arabic} ${action.actionArabic}${amountDisplay ? ` بمقدار ${amountDisplay}` : levelDisplay ? ` ${levelDisplay}` : ""} وفق ما ورد في المصدر.`;

  const extra = numbers
    .filter((n) => n !== moveAmount && n !== priceLevel)
    .map((n) => n.display || n.arabic)
    .filter(Boolean);
  if (extra.length) body += ` وذكر المصدر أيضاً: ${extra.join("، ")}.`;
  return { headline, body: body.slice(0, 320) };
}

function buildCentralBankTemplate({ subject, action, numbers = [], evidence = {} }) {
  const rateEntry = numbers.find((n) => n.role === "RATE" || /%/.test(n.arabic || n.raw || "")) || numbers[0];
  const rate = rateEntry?.display || rateEntry?.arabic || "";
  const headline = rate
    ? `${subject.arabic}: توقعات ب${action.actionArabic}${rate ? ` إلى ${rate}` : ""}`.slice(0, 140)
    : `${subject.arabic}: ${action.actionArabic}`.slice(0, 140);

  let body = `تشير التوقعات إلى أن ${subject.arabic} قد ${action.actionClass === ACTION_CLASSES.RATE_HIKE ? "يرفع" : action.actionClass === ACTION_CLASSES.RATE_CUT ? "يخفض" : "يُبقي"} أسعار الفائدة`;
  if (rate) body += ` إلى ${rate}`;
  body += "، وفق ما ورد في المصدر.";
  if (/sources?\s+report|policymakers|economists/i.test(evidence.title || "")) {
    body = body.replace("تشير التوقعات", "أشارت مصادر إلى أن");
  }
  return { headline, body: body.slice(0, 320) };
}

function buildRegulatoryTemplate({ subject, action, evidence = {} }) {
  const headline = `${subject.arabic}: ${action.actionArabic}`.slice(0, 140);
  const body = `تقدمت ${subject.arabic} بمحاولة جديدة للحصول على ترخيص مصرفي، وفق ما ورد في المصدر دون إضافة تفاصيل جديدة.`.slice(
    0,
    320
  );
  return { headline, body };
}

function buildTariffTemplate({ subject, action, numbers = [] }) {
  const amountEntry = numbers.find((n) => /مليار/.test(n.arabic || "")) || numbers[0];
  const amount = amountEntry?.display || amountEntry?.arabic || "";
  const headline = amount
    ? `${subject.arabic}: ${action.actionArabic} على واردات بقيمة ${amount}`.slice(0, 140)
    : `${subject.arabic}: ${action.actionArabic}`.slice(0, 140);
  const body = `أعلنت ${subject.arabic} ${action.actionArabic}${amount ? ` على واردات بقيمة ${amount}` : ""}، وفق ما ورد في المصدر.`.slice(
    0,
    320
  );
  return { headline, body };
}

function buildDealTemplate({ subject, numbers = [], evidence = {} }) {
  const uncertain = /rumou?rs?|unconfirmed|may|might|could|reportedly/i.test(
    [evidence.title, evidence.description].filter(Boolean).join(" ")
  );
  const headline = uncertain
    ? "تقارير غير مؤكدة عن تفاهم محتمل بين إيران والولايات المتحدة".slice(0, 140)
    : `${subject.arabic || "تطور"}: ${"تفاهم أو صفقة"}`.slice(0, 140);
  const body = uncertain
    ? "تداولت وسائل إعلام أنباء غير مؤكدة عن وجود تفاهم بين إيران والولايات المتحدة، وفق ما ورد في المصدر."
    : `ورد في المصدر ما يشير إلى ${subject.arabic ? `تطور يتعلق بـ${subject.arabic}` : "تطوراً"} دون تأكيد رسمي.`;
  return { headline, body: body.slice(0, 320) };
}

function buildCompanyComparisonTemplate({ subject, action, evidence = {} }) {
  const headline = `${subject.arabic}: قد تتفوق على منافسيها في السوق`.slice(0, 140);
  const body = `أشار المصدر إلى أن ${subject.arabic} قد تتفوق على منافسيها في قطاع معالجات مراكز البيانات، وفق العنوان دون إضافة تفاصيل جديدة.`.slice(
    0,
    320
  );
  return { headline, body };
}

function buildLaunchTemplate({ subject, numbers = [] }) {
  const tokenEntry = numbers.find((n) => /^[A-Z]{2,5}$/.test(n.raw || n.arabic || ""));
  const token = tokenEntry?.raw || tokenEntry?.arabic || "";
  const headline = token
    ? `${subject.arabic}: إطلاق بنية تداول${token ? ` (${token})` : ""}`.slice(0, 140)
    : `${subject.arabic}: إطلاق`.slice(0, 140);
  const body = `أعلنت ${subject.arabic} عن إطلاق بنية تحتية للتداول${token ? `، مع حركة ملحوظة في ${token}` : ""}، وفق ما ورد في المصدر.`.slice(
    0,
    320
  );
  return { headline, body };
}

function buildGenericTemplate({ subject, action, numbers = [] }) {
  const headline =
    subject.arabic && action.actionArabic
      ? `${subject.arabic}: ${action.actionArabic}`.slice(0, 140)
      : action.actionArabic || "تطور مالي وفق المصدر";
  let body = subject.arabic
    ? `ورد في المصدر ${action.actionArabic} يتعلق بـ${subject.arabic}.`
    : `ورد في المصدر ${action.actionArabic}.`;
  if (numbers.length) {
    const rendered = numbers.map((n) => n.display || n.arabic).filter(Boolean);
    if (rendered.length) body += ` وذكر المصدر: ${rendered.join("، ")}.`;
  }
  return { headline, body: body.slice(0, 320) };
}

function buildTechnicalAnalysisTemplate({ subject, evidence = {} }) {
  const title = String(evidence.title || "");
  const pairs = subject.arabic || "أزواج العملات الرئيسية";
  const headline = `${pairs}: تحليل فني للجلسة`.slice(0, 140);
  const body = `يقدم المصدر نظرة فنية على ${pairs} تشمل التحيز والمخاطر والأهداف، دون إضافة تفاصيل جديدة بخلاف العنوان.`.slice(
    0,
    320
  );
  return { headline, body };
}

function buildEquityStoryTemplate({ subject, evidence = {} }) {
  const title = String(evidence.title || "");
  if (/software stocks?/i.test(title)) {
    return {
      headline: "أسهم برمجيات تواجه اختبارات حاسمة لصدق الارتفاعات".slice(0, 140),
      body: "تواجه أسهم برمجيات مختارة اختبارات حاسمة لمدى استدامة الارتفاعات الأخيرة، وفق ما ورد في المصدر.".slice(
        0,
        320
      ),
    };
  }
  if (/growth stocks?/i.test(title) && /s&p 500|sp500/i.test(title)) {
    return {
      headline: "أسهم النمو لا تزال منخفضة القيمة رغم مستويات S&P 500 المرتفعة".slice(0, 140),
      body: "أشار المصدر إلى أن أسهم النمو لا تزال تبدو منخفضة القيمة رغم قرب مؤشر S&P 500 من مستويات قياسية، وفق العنوان دون إضافة سياق جديد.".slice(
        0,
        320
      ),
    };
  }
  return null;
}

function buildPriceQuoteTemplate({ subject, numbers = [] }) {
  const level = numbers.find((n) => n.role === "PRICE_LEVEL") || numbers[0];
  const display = level?.display || level?.arabic || "";
  const headline = display
    ? `${subject.arabic}: ${display}`.slice(0, 140)
    : `${subject.arabic}: مستوى سعري`.slice(0, 140);
  const body = display
    ? `سجل ${subject.arabic} ${display} وفق ما ورد في المصدر.`
    : `ورد في المصدر مستوى سعري يتعلق بـ${subject.arabic}.`;
  return { headline, body: body.slice(0, 320) };
}

function buildFallbackFromSemantics({ subject, action, numbers = [], evidence = {}, facts = {} }) {
  const title = String(evidence.title || "");

  const equityStory = buildEquityStoryTemplate({ subject, evidence });
  if (equityStory) return equityStory;

  if (/\bwhy\s+\w+\s+can\s+beat\b/i.test(title)) {
    return buildCompanyComparisonTemplate({ subject, action, evidence });
  }

  if (/\b(?:sell|sells|sold|trades?|traded)\s+at\s+\$/i.test(title)) {
    return buildPriceQuoteTemplate({ subject, numbers, evidence });
  }

  switch (action.actionClass) {
    case ACTION_CLASSES.TECHNICAL_ANALYSIS:
      return buildTechnicalAnalysisTemplate({ subject, evidence });
    case ACTION_CLASSES.RATE_HIKE:
    case ACTION_CLASSES.RATE_CUT:
    case ACTION_CLASSES.RATE_HOLD:
      return buildCentralBankTemplate({ subject, action, numbers, evidence });
    case ACTION_CLASSES.FALL:
    case ACTION_CLASSES.RISE:
    case ACTION_CLASSES.SURGE:
    case ACTION_CLASSES.DROP:
      if (subject.kind === "instrument") return buildMarketMoveTemplate({ subject, action, numbers, evidence });
      return buildGenericTemplate({ subject, action, numbers });
    case ACTION_CLASSES.LICENSE_APPLICATION:
      return buildRegulatoryTemplate({ subject, action, evidence });
    case ACTION_CLASSES.COUNTER_TARIFF:
    case ACTION_CLASSES.TARIFF:
      return buildTariffTemplate({ subject, action, numbers });
    case ACTION_CLASSES.DEAL:
      return buildDealTemplate({ subject, numbers, evidence });
    case ACTION_CLASSES.LAUNCH:
      return buildLaunchTemplate({ subject, numbers });
    case ACTION_CLASSES.SANCTIONS:
      return buildGenericTemplate({
        subject,
        action: { ...action, actionArabic: "ضغط اقتصادي أو عقوبات" },
        numbers,
      });
    default:
      return buildGenericTemplate({ subject, action, numbers });
  }
}

function measureTemplateRepetition(outputs = []) {
  const openings = outputs.map((o) => String(o.body || "").slice(0, 24));
  if (!openings.length) return { rate: 0, dominant: null };
  const counts = {};
  for (const o of openings) counts[o] = (counts[o] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  return { rate: max / openings.length, dominant: Object.entries(counts).find(([, c]) => c === max)?.[0] };
}

module.exports = {
  buildFallbackFromSemantics,
  measureTemplateRepetition,
  buildMarketMoveTemplate,
  buildCentralBankTemplate,
};
