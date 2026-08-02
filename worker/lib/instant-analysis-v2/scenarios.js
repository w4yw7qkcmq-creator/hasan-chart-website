function buildScenarios({ decision, tradePlan, structure, market }) {
  const primaryDirection = decision.direction === "long" ? "long" : decision.direction === "short" ? "short" : "neutral";
  const altDirection = primaryDirection === "long" ? "short" : primaryDirection === "short" ? "long" : "neutral";

  const primaryProb = decision.state === "actionable" ? Math.min(68, 50 + Math.floor(decision.confidence * 0.18)) : 55;
  const alternativeProb = 100 - primaryProb;

  return {
    primary: {
      direction: primaryDirection,
      probability: primaryProb,
      title:
        decision.state === "actionable"
          ? primaryDirection === "long"
            ? "امتداد صاعد بعد تأكيد الهيكل"
            : "امتداد هابط بعد تأكيد الهيكل"
          : "استمرار المراقبة دون دخول",
      conditions: [
        structure.bos.detected ? `BOS ${structure.bos.direction}` : "انتظار BOS",
        market.alignment === "aligned" ? "توافق الأطر الزمنية" : "مراقبة توافق الأطر",
      ].filter(Boolean),
      expectedPath:
        tradePlan.isActionable && tradePlan.targets.length
          ? tradePlan.targets.map((t) => `هدف ${t.label} عند ${t.price}`)
          : ["انتظار إعادة اختبار أو كسر واضح"],
      invalidation: tradePlan.invalidation?.condition || "كسر الهيكل الحالي",
    },
    alternative: {
      direction: altDirection,
      probability: alternativeProb,
      title:
        altDirection === "long"
          ? "سيناريو ارتداد صاعد بديل"
          : altDirection === "short"
            ? "سيناريو رفض هابط بديل"
            : "سيناريو محايد",
      conditions: ["فشل السيناريو الأساسي", structure.choch.detected ? `CHOCH ${structure.choch.direction}` : "تغير سلوك السعر"],
      expectedPath: ["عودة نحو مناطق السيولة المقابلة"],
      invalidation: "إبطال السيناريو عند كسر المستوى المرجعي المعاكس",
    },
  };
}

module.exports = { buildScenarios };
