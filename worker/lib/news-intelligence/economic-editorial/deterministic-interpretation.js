const { parseEconomicNumber } = require("../../economic-releases/normalize");
const { getInterpretationMetadata, getEventArabicName } = require("./interpretation-registry");

/** @typedef {'POSITIVE'|'NEGATIVE'|'NEUTRAL'|'MIXED'|'CONTEXTUAL'} UsdBias */

function compareActualToForecast(actual, forecast) {
  const actualNum = parseEconomicNumber(actual);
  const forecastNum = parseEconomicNumber(forecast);
  if (actualNum === null || forecastNum === null) {
    return { relation: "UNKNOWN", delta: null };
  }
  if (actualNum === forecastNum) {
    return { relation: "INLINE", delta: 0 };
  }
  return {
    relation: actualNum > forecastNum ? "ABOVE" : "BELOW",
    delta: actualNum - forecastNum,
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

function interpretSingleEvent(event = {}) {
  const eventType = event.eventType;
  const meta = getInterpretationMetadata(eventType);
  const comparison = compareActualToForecast(event.actual, event.forecast);
  const nameAr = getEventArabicName(eventType);

  if (meta.betterWhen === "CONTEXTUAL" || meta.betterWhen === "RATE_POLICY") {
    return {
      eventType,
      nameAr,
      comparison,
      signal: "CONTEXTUAL",
      usdBias: "CONTEXTUAL",
      factLine: buildFactComparisonLine(comparison, event),
      interpretationLine: buildContextualInterpretation(eventType, comparison, event),
      impactLine: buildPotentialImpact("CONTEXTUAL", meta.marketSensitivity),
    };
  }

  const labor = resolveLaborSignal(comparison.relation, meta.betterWhen);
  return {
    eventType,
    nameAr,
    comparison,
    signal: labor.signal,
    usdBias: labor.usdBias,
    factLine: buildFactComparisonLine(comparison, event),
    interpretationLine: buildInterpretationLine(eventType, labor.signal, comparison, meta),
    impactLine: buildPotentialImpact(labor.usdBias, meta.marketSensitivity),
  };
}

function buildFactComparisonLine(comparison, event) {
  if (comparison.relation === "UNKNOWN") {
    return null;
  }
  if (comparison.relation === "INLINE") {
    return "جاءت القراءة مطابقة للمتوقع.";
  }
  if (comparison.relation === "BELOW") {
    return "جاءت القراءة أقل من المتوقع.";
  }
  return "جاءت القراءة أعلى من المتوقع.";
}

function buildInterpretationLine(eventType, signal, comparison, meta) {
  if (comparison.relation === "INLINE") {
    return "القراءة متوافقة مع توقعات الأسواق، مع تأثير محدود غالبًا.";
  }
  if (eventType.includes("JOBLESS") || eventType.includes("UNEMPLOYMENT")) {
    if (signal === "STRONGER") {
      return "تشير القراءة إلى متانة نسبية في سوق العمل الأمريكي.";
    }
    if (signal === "WEAKER") {
      return "تشير القراءة إلى ضعف نسبي في سوق العمل الأمريكي.";
    }
  }
  if (meta.betterWhen === "HIGHER" && signal === "STRONGER") {
    return "تشير القراءة إلى زخم اقتصادي أقوى من المتوقع.";
  }
  if (meta.betterWhen === "HIGHER" && signal === "WEAKER") {
    return "تشير القراءة إلى زخم اقتصادي أضعف من المتوقع.";
  }
  return "تشير القراءة إلى انحراف واضح عن التوقعات.";
}

function buildContextualInterpretation(eventType, comparison, event) {
  if (/CPI|PPI|PCE|INFLATION/i.test(eventType)) {
    if (comparison.relation === "ABOVE") {
      return "جاءت قراءة التضخم أعلى من المتوقع، ما يعيد التركيز على مسار الفائدة والتسعير.";
    }
    if (comparison.relation === "BELOW") {
      return "جاءت قراءة التضخم أدنى من المتوقع، ما يخفف بعض ضغوط التسعير.";
    }
    return "قراءة التضخم قريبة من التوقعات، مع تأثير محدود على التسعير قصير الأجل.";
  }
  return "الحدث يحتاج قراءة سياقية قبل استنتاج اتجاه واضح للأسواق.";
}

function buildPotentialImpact(usdBias, sensitivities = []) {
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
      markets.push("التأثير على الدولار الأمريكي محدود");
    }
  }
  if (sensitivities.includes("GOLD")) {
    if (usdBias === "POSITIVE") {
      markets.push("مع مراقبة الذهب");
    } else if (usdBias === "NEGATIVE") {
      markets.push("مع مراقبة تفاعل الذهب");
    }
  }
  if (!markets.length) {
    return "التأثير غير واضح حتى الآن";
  }
  return `${markets.join("، ")}.`;
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
  interpretSingleEvent,
  interpretEventFamily,
  buildPotentialImpact,
};
