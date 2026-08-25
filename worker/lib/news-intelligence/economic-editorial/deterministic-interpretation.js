const { compareEconomicValues, parseEconomicNumber } = require("../../economic-releases/normalize");
const { inferEventNumericScale } = require("../../economic-releases/numeric-units");
const { getInterpretationMetadata, getEventArabicName } = require("./interpretation-registry");

/** @typedef {'POSITIVE'|'NEGATIVE'|'NEUTRAL'|'MIXED'|'CONTEXTUAL'} UsdBias */

function compareActualToForecast(actual, forecast, eventType = null) {
  return compareEconomicValues(actual, forecast, { eventType });
}

function compareActualToPrevious(actual, previous, eventType = null) {
  if (!actual || !previous) {
    return { relation: "UNKNOWN", delta: null };
  }
  const scale = inferEventNumericScale(eventType, [actual, previous]);
  const actualNum = parseEconomicNumber(actual, { expectedScale: scale, eventType, peerValues: [previous] });
  const previousNum = parseEconomicNumber(previous, { expectedScale: scale, eventType, peerValues: [actual] });
  if (actualNum === null || previousNum === null) {
    return { relation: "UNKNOWN", delta: null };
  }
  if (actualNum === previousNum) {
    return { relation: "INLINE", delta: 0 };
  }
  return {
    relation: actualNum > previousNum ? "ABOVE" : "BELOW",
    delta: actualNum - previousNum,
  };
}

function resolveLaborSignal(relation, betterWhen) {
  if (relation === "UNKNOWN" || relation === "INLINE") {
    return { signal: "NEUTRAL", usdBias: "NEUTRAL" };
  }
  const actualBetter =
    (betterWhen === "LOWER" && relation === "BELOW") || (betterWhen === "HIGHER" && relation === "ABOVE");
  const actualWorse =
    (betterWhen === "LOWER" && relation === "ABOVE") || (betterWhen === "HIGHER" && relation === "BELOW");
  if (actualBetter) {
    return { signal: "STRONGER", usdBias: "POSITIVE" };
  }
  if (actualWorse) {
    return { signal: "WEAKER", usdBias: "NEGATIVE" };
  }
  return { signal: "NEUTRAL", usdBias: "NEUTRAL" };
}

function buildForecastRelationPhrase(comparison) {
  if (comparison.relation === "INLINE") {
    return "جاءت القراءة مطابقة للتوقعات";
  }
  if (comparison.relation === "ABOVE") {
    return "جاءت القراءة أعلى من التوقعات";
  }
  if (comparison.relation === "BELOW") {
    return "جاءت القراءة دون التوقعات";
  }
  return null;
}

function buildPreviousRelationPhrase(previousComparison) {
  if (previousComparison.relation === "ABOVE") {
    return "أعلى من القراءة السابقة";
  }
  if (previousComparison.relation === "BELOW") {
    return "أدنى من القراءة السابقة";
  }
  if (previousComparison.relation === "INLINE") {
    return "مماثلة للقراءة السابقة";
  }
  return null;
}

function buildFactComparisonLine(comparison) {
  return buildForecastRelationPhrase(comparison);
}

function buildInterpretationLine(eventType, signal, comparison, meta, previousComparison = null) {
  const safeEventType = String(eventType || "");
  if (comparison.relation === "UNKNOWN") {
    return "تعذر تحديد المقارنة مع التوقعات من البيانات المتاحة.";
  }

  const forecastPhrase = buildForecastRelationPhrase(comparison);
  const previousPhrase = buildPreviousRelationPhrase(previousComparison);
  let combined = forecastPhrase || "";
  if (previousPhrase && forecastPhrase) {
    combined = `${forecastPhrase} و${previousPhrase}.`;
  } else if (previousPhrase) {
    combined = `جاءت القراءة ${previousPhrase}.`;
  } else if (forecastPhrase) {
    combined = `${forecastPhrase}.`;
  }

  if (comparison.relation === "INLINE") {
    const suffix =
      meta.betterWhen === "CONTEXTUAL" || meta.betterWhen === "RATE_POLICY"
        ? " مع تأثير محدود غالبًا على التسعير قصير الأجل."
        : " مع تأثير محدود مبدئيًا على الدولار الأمريكي.";
    return combined.endsWith(".") ? combined.slice(0, -1) + suffix : combined + suffix;
  }

  if (/CPI|PPI|PCE|INFLATION/i.test(safeEventType)) {
    if (comparison.relation === "ABOVE") {
      return `${combined} ما يعيد التركيز على مسار الفائدة والتسعير.`;
    }
    if (comparison.relation === "BELOW") {
      return `${combined} ما يخفف بعض ضغوط التسعير.`;
    }
  }

  if (safeEventType.includes("JOBLESS") || safeEventType.includes("UNEMPLOYMENT")) {
    if (signal === "STRONGER") {
      return `${combined} ما يشير إلى متانة نسبية في سوق العمل.`;
    }
    if (signal === "WEAKER") {
      return `${combined} ما يشير إلى ضعف نسبي في سوق العمل.`;
    }
  }

  if (meta.betterWhen === "HIGHER" && signal === "STRONGER") {
    return `${combined} ما يشير إلى زخمًا اقتصاديًا أقوى من المتوقع.`;
  }
  if (meta.betterWhen === "HIGHER" && signal === "WEAKER") {
    return `${combined} ما يشير إلى زخمًا اقتصاديًا أضعف من المتوقع.`;
  }
  if (meta.betterWhen === "LOWER" && signal === "STRONGER") {
    return `${combined} ما يعد ذلك إيجابيًا نسبيًا للاقتصاد.`;
  }
  if (meta.betterWhen === "LOWER" && signal === "WEAKER") {
    return `${combined} ما يعد ذلك سلبيًا نسبيًا للاقتصاد.`;
  }

  return `${combined} مع متابعة تفاعل الدولار والذهب.`;
}

function buildContextualInterpretation(eventType, comparison, event) {
  const safeEventType = String(eventType || "");
  if (comparison.relation === "UNKNOWN") {
    return "تعذر تحديد المقارنة مع التوقعات من البيانات المتاحة.";
  }
  if (/CPI|PPI|PCE|INFLATION/i.test(safeEventType)) {
    if (comparison.relation === "ABOVE") {
      return "جاءت قراءة التضخم أعلى من المتوقع، ما يعيد التركيز على مسار الفائدة والتسعير.";
    }
    if (comparison.relation === "BELOW") {
      return "جاءت قراءة التضخم أدنى من المتوقع، ما يخفف بعض ضغوط التسعير.";
    }
    return "قراءة التضخم قريبة من التوقعات، مع تأثير محدود على التسعير قصير الأجل.";
  }
  return buildInterpretationLine(
    eventType,
    "NEUTRAL",
    comparison,
    { betterWhen: "CONTEXTUAL" },
    compareActualToPrevious(event.actual, event.previous, eventType)
  );
}

function buildPotentialImpact(usdBias, sensitivities = []) {
  if (usdBias === "NEUTRAL") {
    return "تأثير محدود مبدئيًا على الدولار الأمريكي.";
  }
  const markets = [];
  if (sensitivities.includes("USD")) {
    if (usdBias === "POSITIVE") {
      markets.push("قد يدعم ذلك الدولار الأمريكي نسبيًا");
    } else if (usdBias === "NEGATIVE") {
      markets.push("قد يضغط ذلك على الدولار الأمريكي نسبيًا");
    } else if (usdBias === "MIXED") {
      markets.push("التأثير على الدولار الأمريكي مختلط");
    } else if (usdBias === "CONTEXTUAL") {
      markets.push("التأثير على الدولار يعتمد على سياق التضخم والفائدة");
    } else {
      markets.push("تأثير محدود مبدئيًا على الدولار الأمريكي");
    }
  }
  if (sensitivities.includes("GOLD") && usdBias !== "NEUTRAL" && usdBias !== "CONTEXTUAL") {
    markets.push("مع مراقبة الذهب");
  }
  if (!markets.length) {
    return "تأثير محدود مبدئيًا على الدولار الأمريكي.";
  }
  return `${markets.join("، ")}.`;
}

function interpretSingleEvent(event = {}) {
  const eventType = event.eventType;
  const meta = getInterpretationMetadata(eventType);
  const comparison = compareActualToForecast(event.actual, event.forecast, eventType);
  const previousComparison = compareActualToPrevious(event.actual, event.previous, eventType);
  const nameAr = getEventArabicName(eventType);

  if (meta.betterWhen === "CONTEXTUAL" || meta.betterWhen === "RATE_POLICY") {
    return {
      eventType,
      nameAr,
      comparison,
      previousComparison,
      signal: "CONTEXTUAL",
      usdBias: "CONTEXTUAL",
      factLine: buildFactComparisonLine(comparison),
      interpretationLine: buildContextualInterpretation(eventType, comparison, event),
      impactLine: buildPotentialImpact("CONTEXTUAL", meta.marketSensitivity),
    };
  }

  const labor = resolveLaborSignal(comparison.relation, meta.betterWhen);
  return {
    eventType,
    nameAr,
    comparison,
    previousComparison,
    signal: labor.signal,
    usdBias: labor.usdBias,
    factLine: buildFactComparisonLine(comparison),
    interpretationLine: buildInterpretationLine(eventType, labor.signal, comparison, meta, previousComparison),
    impactLine: buildPotentialImpact(labor.usdBias, meta.marketSensitivity),
  };
}

function interpretEventFamily(children = []) {
  const interpreted = children.map((child) => interpretSingleEvent(child));
  const biases = interpreted.map((item) => item.usdBias).filter((b) => b !== "CONTEXTUAL" && b !== "NEUTRAL");
  const uniqueBiases = [...new Set(biases)];

  let familyUsdBias = "NEUTRAL";
  if (uniqueBiases.length > 1) {
    familyUsdBias = "MIXED";
  } else if (uniqueBiases.length === 1) {
    familyUsdBias = uniqueBiases[0];
  } else if (interpreted.some((item) => item.usdBias === "CONTEXTUAL")) {
    familyUsdBias = "CONTEXTUAL";
  }

  let familyInterpretation;
  if (familyUsdBias === "MIXED") {
    familyInterpretation =
      "جاءت بيانات إعانات البطالة بصورة مختلطة، مع إشارات متباينة بين الطلبات الأولية والمستمرة.";
  } else if (familyUsdBias === "POSITIVE") {
    familyInterpretation = "تشير البيانات مجتمعة إلى متانة نسبية في سوق العمل الأمريكي.";
  } else if (familyUsdBias === "NEGATIVE") {
    familyInterpretation = "تشير البيانات مجتمعة إلى ضعف نسبي في سوق العمل الأمريكي.";
  } else {
    familyInterpretation = "البيانات قريبة من التوقعات، مع تأثير محدود على المزاج العام.";
  }

  let familyImpact;
  if (familyUsdBias === "MIXED") {
    familyImpact = "التأثير على الدولار الأمريكي مختلط، مع مراقبة تفاعل الذهب والمؤشرات.";
  } else {
    familyImpact = buildPotentialImpact(familyUsdBias, ["USD", "GOLD"]);
  }

  return {
    children: interpreted,
    familyUsdBias,
    familyInterpretation,
    familyImpact,
  };
}

module.exports = {
  compareActualToForecast,
  compareActualToPrevious,
  interpretSingleEvent,
  interpretEventFamily,
  buildPotentialImpact,
  buildForecastRelationPhrase,
};
