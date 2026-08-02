"use client";

import dynamic from "next/dynamic";
import {
  TREND_TABLE_TIMEFRAMES,
  buildExecutiveSummary,
  buildReportText,
  decisionCardMeta,
  evidenceIcon,
  formatDurationMs,
  formatPrice,
  labelDataQuality,
  labelDirection,
  labelEvidenceStatus,
  labelFactor,
  labelFactorStatus,
  labelMarketState,
  labelResultTimeframe,
  labelRisk,
  labelState,
  labelTimeframe,
  labelTimeframeLong,
  labelTrend,
  labelVolatility,
  trendArrow,
} from "../../../lib/instant-analysis-labels";

const InstantAnalysisLightweightChart = dynamic(() => import("./InstantAnalysisLightweightChart"), {
  ssr: false,
  loading: () => <div className="ia-v3-chart-empty">جارٍ تحميل الرسم...</div>,
});

function SkeletonBlock({ className = "" }) {
  return <div className={`ia-v3-skeleton ${className}`} aria-hidden="true" />;
}

export function InstantAnalysisV3Skeleton() {
  return (
    <div className="ia-v3 ia-v3--loading" dir="rtl">
      <SkeletonBlock className="ia-v3-skeleton--header" />
      <SkeletonBlock className="ia-v3-skeleton--chart" />
      <div className="ia-v3-grid ia-v3-grid--2">
        <SkeletonBlock className="ia-v3-skeleton--card" />
        <SkeletonBlock className="ia-v3-skeleton--card" />
      </div>
      <SkeletonBlock className="ia-v3-skeleton--card ia-v3-skeleton--tall" />
    </div>
  );
}

function MetricChip({ label, value, tone = "default" }) {
  return (
    <div className={`ia-v3-metric ia-v3-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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

function computeExpectedMove(plan) {
  if (!plan?.isActionable || !plan.entryZone) return null;
  const entryMid = (Number(plan.entryZone.from) + Number(plan.entryZone.to)) / 2;
  const lastTarget = plan.targets?.[plan.targets.length - 1]?.price;
  if (!Number.isFinite(entryMid) || !Number.isFinite(lastTarget)) return null;
  return Math.abs(lastTarget - entryMid);
}

export default function InstantAnalysisV3Panel({ result }) {
  const v2 = result?.v2 || result;
  const decision = v2.decision || {};
  const market = v2.market || {};
  const plan = v2.tradePlan || {};
  const setupQuality = v2.setupQuality || {};
  const card = decisionCardMeta(decision, setupQuality);
  const resultTimeframe = v2.meta?.executionTimeframe || null;
  const durationMs = v2.meta?.durationMs || v2.meta?.timings?.totalMs || 0;
  const executiveSummary = buildExecutiveSummary(v2);
  const expectedMove = computeExpectedMove(plan);

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

  const scenarios = [v2.scenarios?.primary, v2.scenarios?.alternative].filter(Boolean);

  return (
    <div className="ia-v3" dir="rtl">
      <header className="ia-v3-header">
        <div className="ia-v3-header__main">
          <div>
            <p className="ia-v3-header__symbol">{v2.symbol}</p>
            <p className="ia-v3-header__price">{formatPrice(market.currentPrice)}</p>
          </div>
          <div className="ia-v3-header__meta-grid">
            <MetricChip label="الفريم" value={resultTimeframe ? labelTimeframeLong(resultTimeframe) : "—"} />
            <MetricChip label="وقت الإنشاء" value={v2.generatedAt ? new Date(v2.generatedAt).toLocaleString("ar") : "—"} />
            <MetricChip label="مدة الإنشاء" value={formatDurationMs(durationMs)} />
            <MetricChip label="جودة البيانات" value={labelDataQuality(v2.data?.quality)} />
            <MetricChip label="الثقة" value={`${decision.confidence || 0}%`} tone="primary" />
            <MetricChip label="الحالة" value={labelState(decision.state)} tone={decision.state === "avoid" ? "danger" : decision.state === "actionable" ? "success" : "warning"} />
            <MetricChip label="درجة الإعداد" value={setupQuality.grade || decision.opportunityGrade || "—"} tone="primary" />
          </div>
        </div>
        <div className="ia-v3-header__actions">
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={copyReport}>نسخ التقرير</button>
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={shareReport}>مشاركة</button>
          <button type="button" className="ia-v3-btn ia-v3-btn--ghost" onClick={downloadPdf}>تنزيل PDF</button>
        </div>
      </header>

      <InstantAnalysisLightweightChart
        candles={v2.chart?.candles || []}
        annotations={v2.chart?.annotations || []}
        symbol={v2.symbol}
        timeframeLabel={resultTimeframe ? labelTimeframeLong(resultTimeframe) : "—"}
      />

      <section className="ia-v3-card ia-v3-card--exec">
        <h3 className="ia-v3-card__title">الخلاصة التنفيذية</h3>
        <div className="ia-v3-exec">
          {executiveSummary.split("\n").map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      <section className={`ia-v3-card ia-v3-decision ia-v3-decision--hero ia-v3-decision--${card.tone}`}>
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

      <div className="ia-v3-grid ia-v3-grid--2 ia-v3-grid--equal">
        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">خطة التداول</h3>
          {plan.isActionable ? (
            <div className="ia-v3-plan">
              <div><span>الاتجاه</span><strong>{labelDirection(decision.direction)}</strong></div>
              <div><span>منطقة الدخول</span><strong>{formatPrice(plan.entryZone?.from)} – {formatPrice(plan.entryZone?.to)}</strong></div>
              <div><span>وقف الخسارة</span><strong>{formatPrice(plan.stopLoss)}</strong></div>
              {(plan.targets || []).map((tp, index) => (
                <div key={tp.label || index}><span>{`هدف ${index + 1}`}</span><strong>{formatPrice(tp.price)}</strong></div>
              ))}
              <div><span>العائد للمخاطرة</span><strong>{plan.riskReward?.toTp1 ? `1:${plan.riskReward.toTp1}` : "—"}</strong></div>
              <div><span>المخاطرة</span><strong>{labelRisk(decision.riskLevel)}</strong></div>
              <div><span>حجم الحركة المتوقع</span><strong>{expectedMove ? formatPrice(expectedMove) : "—"}</strong></div>
              <div><span>شرط التفعيل</span><strong>{plan.trigger || "—"}</strong></div>
            </div>
          ) : (
            <div className="ia-v3-empty-state">لا توجد صفقة عالية الجودة حالياً.</div>
          )}
        </section>

        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">الاتجاه العام</h3>
          <div className="ia-v3-trend-outlook">
            <div className="ia-v3-trend-outlook__row ia-v3-trend-outlook__row--bullish">
              <span>قصير المدى</span>
              <strong>{trendArrow(v2.trendOutlook?.short)} {labelTrend(v2.trendOutlook?.short)}</strong>
            </div>
            <div className="ia-v3-trend-outlook__row ia-v3-trend-outlook__row--medium">
              <span>متوسط المدى</span>
              <strong>{trendArrow(v2.trendOutlook?.medium)} {labelTrend(v2.trendOutlook?.medium)}</strong>
            </div>
            <div className="ia-v3-trend-outlook__row ia-v3-trend-outlook__row--long">
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
        <h3 className="ia-v3-card__title">مقارنة الفريمات</h3>
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
                      {trendArrow(trend)} {labelTrend(trend)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

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
        <div className="ia-v3-factor-grid">
          {(setupQuality.factors || []).map((factor) => (
            <div key={factor.key} className="ia-v3-factor">
              <span>{labelFactor(factor.key)}</span>
              <strong>{labelFactorStatus(factor.status)}</strong>
              <em>{factor.points > 0 ? `+${factor.points}` : factor.points}</em>
            </div>
          ))}
        </div>
      </section>

      <div className="ia-v3-grid ia-v3-grid--2 ia-v3-grid--equal">
        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">الأدلة الفنية</h3>
          <div className="ia-v3-evidence-list">
            {(v2.evidence || []).map((item) => (
              <EvidenceRow key={`${item.type}-${item.label}`} item={item} />
            ))}
          </div>
        </section>

        <section className="ia-v3-card">
          <h3 className="ia-v3-card__title">السيناريوهات</h3>
          <div className="ia-v3-scenarios">
            {scenarios.map((scenario, index) => (
              <div key={scenario.title || index} className="ia-v3-scenario">
                <div className="ia-v3-scenario__head">
                  <strong>{index === 0 ? "السيناريو الأساسي" : "السيناريو البديل"}</strong>
                  <span>الاحتمال {scenario.probability}%</span>
                </div>
                <p className="ia-v3-scenario__title">{scenario.title}</p>
                <div className="ia-v3-progress ia-v3-progress--scenario">
                  <div style={{ width: `${scenario.probability}%` }} />
                </div>
                <p>{scenario.invalidation}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ia-v3-card ia-v3-risk">
        <h3 className="ia-v3-card__title">إدارة المخاطر</h3>
        <div className="ia-v3-plan">
          <div><span>حجم المخاطرة المقترح</span><strong>{v2.riskManagement?.suggestedRiskPercent || 0}%</strong></div>
          <div><span>السبب</span><strong>{plan.isActionable ? "صفقة قابلة للتنفيذ ضمن حدود المخاطرة التعليمية" : "لا توجد صفقة جاهزة حالياً"}</strong></div>
          <div><span>أفضل طريقة للإدارة</span><strong>{v2.riskManagement?.note || "—"}</strong></div>
          <div><span>متى يتم الإلغاء</span><strong>{plan.invalidation?.condition || v2.scenarios?.primary?.invalidation || "عند إبطال الهيكل الحالي"}</strong></div>
        </div>
        <p className="ia-v3-disclaimer">{v2.explanation?.riskWarning}</p>
      </section>

      <section className="ia-v3-card ia-v3-explanation">
        <h3 className="ia-v3-card__title">الشرح التحليلي</h3>
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
      </section>
    </div>
  );
}
