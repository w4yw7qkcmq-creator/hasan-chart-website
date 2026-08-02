"use client";

import {
  TREND_TABLE_TIMEFRAMES,
  buildReportText,
  decisionCardMeta,
  evidenceIcon,
  formatPrice,
  labelDirection,
  labelEvidenceStatus,
  labelMarketState,
  labelRisk,
  labelState,
  labelResultTimeframe,
  labelTimeframe,
  labelTrend,
  labelVolatility,
  trendArrow,
} from "../../../lib/instant-analysis-labels";

function SkeletonBlock({ className = "" }) {
  return <div className={`ia-v3-skeleton ${className}`} aria-hidden="true" />;
}

export function InstantAnalysisV3Skeleton() {
  return (
    <div className="ia-v3 ia-v3--loading" dir="rtl">
      <SkeletonBlock className="ia-v3-skeleton--tf" />
      <SkeletonBlock className="ia-v3-skeleton--chart" />
      <div className="ia-v3-grid ia-v3-grid--2">
        <SkeletonBlock className="ia-v3-skeleton--card" />
        <SkeletonBlock className="ia-v3-skeleton--card" />
      </div>
      <SkeletonBlock className="ia-v3-skeleton--card ia-v3-skeleton--tall" />
    </div>
  );
}

function EvidenceRow({ item }) {
  return (
    <div className={`ia-v3-evidence-row ia-v3-evidence-row--${item.status || "absent"}`}>
      <span className="ia-v3-evidence-row__icon" aria-hidden="true">{evidenceIcon(item)}</span>
      <div className="ia-v3-evidence-row__body">
        <strong>{item.label}</strong>
        <p>{item.description}</p>
      </div>
      <span className="ia-v3-evidence-row__status">{labelEvidenceStatus(item.status)}</span>
    </div>
  );
}

export default function InstantAnalysisV3Panel({ result }) {
  const v2 = result?.v2 || result;
  const decision = v2.decision || {};
  const market = v2.market || {};
  const plan = v2.tradePlan || {};
  const setupQuality = v2.setupQuality || {};
  const card = decisionCardMeta(decision, setupQuality);
  const resultTimeframe = v2.meta?.executionTimeframe || null;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(v2));
    } catch {
      // ignore
    }
  };

  const shareReport = async () => {
    const text = buildReportText(v2);
    if (navigator.share) {
      try {
        await navigator.share({ title: `تحليل ${v2.symbol}`, text });
        return;
      } catch {
        // fall through
      }
    }
    await copyReport();
  };

  const downloadPdf = () => {
    window.print();
  };

  return (
    <div className="ia-v3" dir="rtl">
      <div className="ia-v3-toolbar">
        <div className="ia-v3-toolbar__meta">
          <p className="ia-v3-toolbar__symbol">{v2.symbol}</p>
          <p className="ia-v3-toolbar__price">{formatPrice(market.currentPrice)}</p>
          <p className="ia-v3-toolbar__sub">
            {v2.generatedAt ? new Date(v2.generatedAt).toLocaleString("ar") : "—"}
            {" · "}
            جودة البيانات: {v2.data?.quality === "good" ? "جيدة" : v2.data?.quality === "degraded" ? "منخفضة" : "غير كافية"}
          </p>
          {resultTimeframe ? (
            <p className="ia-v3-toolbar__timeframe">فريم التحليل: {labelResultTimeframe(v2)}</p>
          ) : null}
        </div>
        <div className="ia-v3-toolbar__actions">
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={shareReport}>
            مشاركة
          </button>
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={copyReport}>
            نسخ التقرير
          </button>
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={downloadPdf}>
            تنزيل PDF
          </button>
        </div>
      </div>

      {v2.chart?.image ? (
        <figure className="ia-v3-chart">
          <img
            src={v2.chart.image}
            alt={v2.chart.alt || `رسم ${v2.symbol}`}
            className="ia-v3-chart__img"
          />
          <figcaption className="ia-v3-chart__cap">
            {resultTimeframe ? labelTimeframe(resultTimeframe) : "—"} · {v2.chart.candleCount || 0} شمعة · بيانات OKX
          </figcaption>
        </figure>
      ) : null}

      <div className="ia-v3-grid ia-v3-grid--2">
        <section className={`ia-v3-card ia-v3-decision ia-v3-decision--${card.tone}`}>
          <h3 className="ia-v3-card__title">قرار النظام</h3>
          <div className="ia-v3-decision__hero">
            <span className="ia-v3-decision__emoji" aria-hidden="true">{card.emoji}</span>
            <strong className="ia-v3-decision__title">{card.title}</strong>
          </div>
          <p className="ia-v3-decision__reason">{decision.primaryReason}</p>
          {decision.waitReason ? <p className="ia-v3-decision__wait">{decision.waitReason}</p> : null}
          <div className="ia-v3-decision__chips">
            <span>{labelState(decision.state)}</span>
            <span>{labelDirection(decision.direction)}</span>
            <span>ثقة {decision.confidence || 0}%</span>
            <span>{labelRisk(decision.riskLevel)}</span>
          </div>
        </section>

        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">الاتجاه العام</h3>
          <div className="ia-v3-trend-outlook">
            <div className="ia-v3-trend-outlook__row">
              <span>قصير المدى</span>
              <strong>{trendArrow(v2.trendOutlook?.short)} {labelTrend(v2.trendOutlook?.short)}</strong>
            </div>
            <div className="ia-v3-trend-outlook__row">
              <span>متوسط المدى</span>
              <strong>{trendArrow(v2.trendOutlook?.medium)} {labelTrend(v2.trendOutlook?.medium)}</strong>
            </div>
            <div className="ia-v3-trend-outlook__row">
              <span>طويل المدى</span>
              <strong>{trendArrow(v2.trendOutlook?.long)} {labelTrend(v2.trendOutlook?.long)}</strong>
            </div>
          </div>
          <div className="ia-v3-mini-metrics">
            <div><span>حالة السوق</span><strong>{labelMarketState(market.marketState)}</strong></div>
            <div><span>التقلب</span><strong>{labelVolatility(market.volatility)}</strong></div>
            <div><span>درجة الفرصة</span><strong>{decision.opportunityGrade || "—"}</strong></div>
          </div>
        </section>
      </div>

      <section className="ia-v3-card">
        <h3 className="ia-v3-card__title">جودة الإعداد</h3>
        <div className="ia-v3-setup-quality">
          <div className="ia-v3-setup-quality__grade">{setupQuality.grade || decision.opportunityGrade || "—"}</div>
          <div className="ia-v3-setup-quality__score">
            <strong>{setupQuality.score || 0}</strong>
            <span>/100</span>
            <div className="ia-v3-progress">
              <div style={{ width: `${setupQuality.score || 0}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="ia-v3-card">
        <h3 className="ia-v3-card__title">اتجاه جميع الفريمات</h3>
        <div className="ia-v3-tf-table-wrap">
          <table className="ia-v3-tf-table">
            <thead>
              <tr>
                {TREND_TABLE_TIMEFRAMES.map((tf) => (
                  <th key={tf}>{labelTimeframe(tf)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {TREND_TABLE_TIMEFRAMES.map((tf) => {
                  const trend = v2.timeframeTrends?.[tf] || "neutral";
                  return (
                    <td key={tf} className={`ia-v3-tf-table__cell ia-v3-tf-table__cell--${trend}`}>
                      {labelTrend(trend)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="ia-v3-grid ia-v3-grid--2">
        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">خطة التداول</h3>
          {plan.isActionable ? (
            <div className="ia-v3-plan">
              <div><span>منطقة الدخول</span><strong>{formatPrice(plan.entryZone?.from)} – {formatPrice(plan.entryZone?.to)}</strong></div>
              <div><span>وقف الخسارة</span><strong>{formatPrice(plan.stopLoss)}</strong></div>
              {(plan.targets || []).map((tp) => (
                <div key={tp.label}><span>{tp.label?.replace("TP", "هدف")}</span><strong>{formatPrice(tp.price)}</strong></div>
              ))}
              <div><span>التفعيل</span><strong>{plan.trigger}</strong></div>
            </div>
          ) : (
            <p className="ia-v3-muted">لا توجد صفقة جاهزة الآن</p>
          )}
        </section>

        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">السيناريوهات</h3>
          <div className="ia-v3-scenarios">
            {[v2.scenarios?.primary, v2.scenarios?.alternative].filter(Boolean).map((scenario) => (
              <div key={scenario.title} className="ia-v3-scenario">
                <div className="ia-v3-scenario__head">
                  <strong>{scenario.title}</strong>
                  <span>نسبة النجاح {scenario.probability}%</span>
                </div>
                <div className="ia-v3-progress ia-v3-progress--scenario">
                  <div style={{ width: `${scenario.probability}%` }} />
                </div>
                <p>{scenario.invalidation}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ia-v3-card">
        <h3 className="ia-v3-card__title">الأدلة الفنية</h3>
        <div className="ia-v3-evidence-list">
          {(v2.evidence || []).map((item) => (
            <EvidenceRow key={`${item.type}-${item.label}`} item={item} />
          ))}
        </div>
      </section>

      <section className="ia-v3-card ia-v3-explanation">
        <h3 className="ia-v3-card__title">الشرح التحليلي</h3>
        <div className="ia-v3-explanation__section">
          <h4>ملخص القرار</h4>
          <p>{v2.explanation?.executiveSummary}</p>
        </div>
        <div className="ia-v3-explanation__section">
          <h4>الرؤية المؤسسية</h4>
          <p>{v2.explanation?.institutionalView}</p>
        </div>
        <div className="ia-v3-explanation__section">
          <h4>الرؤية الكلاسيكية</h4>
          <p>{v2.explanation?.classicTechnicalView}</p>
        </div>
        <div className="ia-v3-explanation__section">
          <h4>سبب القرار</h4>
          <ul>{(v2.explanation?.whyThisDecision || []).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="ia-v3-explanation__section">
          <h4>ما الذي ننتظره؟</h4>
          <ul>{(v2.explanation?.whatToWaitFor || []).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="ia-v3-explanation__section">
          <h4>إدارة المخاطر</h4>
          <p>نسبة مخاطرة مقترحة: {v2.riskManagement?.suggestedRiskPercent || 0}%</p>
          <p>{v2.riskManagement?.note}</p>
          <p className="ia-v3-disclaimer">{v2.explanation?.riskWarning}</p>
        </div>
      </section>
    </div>
  );
}
