"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useMemo } from "react";
import {
  REPORT_FOOTER_DISCLAIMER,
  TREND_TABLE_TIMEFRAMES,
  buildExecutiveSummary,
  buildReportText,
  buildSuggestedAction,
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

function SkeletonLine({ className = "" }) {
  return <div className={`ia-v3-skeleton ia-v3-skeleton--line ${className}`} aria-hidden="true" />;
}

function SkeletonBlock({ className = "" }) {
  return <div className={`ia-v3-skeleton ${className}`} aria-hidden="true" />;
}

export function InstantAnalysisV3Skeleton() {
  return (
    <div className="ia-v3 ia-v3--loading ia-v3-report" dir="rtl" aria-busy="true" aria-label="جارٍ تحميل التقرير">
      <section className="ia-v3-section ia-v3-section--header">
        <SkeletonLine className="ia-v3-skeleton--badge" />
        <SkeletonLine className="ia-v3-skeleton--title" />
        <div className="ia-v3-header__meta-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <SkeletonBlock key={index} className="ia-v3-skeleton--metric" />
          ))}
        </div>
      </section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--exec" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--decision" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--chart" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--table" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--card" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--card" /></section>
      <section className="ia-v3-section"><SkeletonBlock className="ia-v3-skeleton--card" /></section>
    </div>
  );
}

function HeaderMetric({ label, value, tone = "default" }) {
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

function TradePlanTable({ plan, decision, expectedMove }) {
  const targets = plan.targets || [];
  const targetPrice = (index) => formatPrice(targets[index]?.price);

  if (!plan.isActionable) {
    return <div className="ia-v3-empty-state">لا توجد صفقة عالية الجودة حالياً.</div>;
  }

  return (
    <div className="ia-v3-table-wrap">
      <table className="ia-v3-trade-table">
        <tbody>
          <tr><th scope="row">الاتجاه</th><td>{labelDirection(decision.direction)}</td></tr>
          <tr><th scope="row">الدخول</th><td>{formatPrice(plan.entryZone?.from)} – {formatPrice(plan.entryZone?.to)}</td></tr>
          <tr><th scope="row">وقف الخسارة</th><td>{formatPrice(plan.stopLoss)}</td></tr>
          <tr><th scope="row">هدف 1</th><td>{targetPrice(0)}</td></tr>
          <tr><th scope="row">هدف 2</th><td>{targetPrice(1)}</td></tr>
          <tr><th scope="row">هدف 3</th><td>{targetPrice(2)}</td></tr>
          <tr><th scope="row">العائد للمخاطرة</th><td>{plan.riskReward?.toTp1 ? `1:${plan.riskReward.toTp1}` : "—"}</td></tr>
          <tr><th scope="row">المخاطرة</th><td>{labelRisk(decision.riskLevel)}</td></tr>
          <tr><th scope="row">الحركة المتوقعة</th><td>{expectedMove ? formatPrice(expectedMove) : "—"}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function InstantAnalysisV3Panel({ result }) {
  const v2 = result?.v2 || result;
  const decision = v2.decision || {};
  const market = v2.market || {};
  const plan = v2.tradePlan || {};
  const setupQuality = v2.setupQuality || {};
  const card = useMemo(() => decisionCardMeta(decision, setupQuality), [decision, setupQuality]);
  const resultTimeframe = v2.meta?.executionTimeframe || null;
  const durationMs = v2.meta?.durationMs || v2.meta?.timings?.totalMs || 0;
  const executiveSummary = useMemo(() => buildExecutiveSummary(v2), [v2]);
  const suggestedAction = useMemo(() => buildSuggestedAction(v2), [v2]);
  const expectedMove = useMemo(() => computeExpectedMove(plan), [plan]);
  const scenarios = useMemo(
    () => [v2.scenarios?.primary, v2.scenarios?.alternative].filter(Boolean),
    [v2.scenarios]
  );

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(v2));
    } catch {
      // ignore clipboard failures
    }
  }, [v2]);

  const shareReport = useCallback(async () => {
    const text = buildReportText(v2);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `تحليل ${v2.symbol}`, text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await copyReport();
  }, [copyReport, v2]);

  const downloadPdf = useCallback(() => {
    window.print();
  }, []);

  return (
    <article className="ia-v3 ia-v3-report" dir="rtl" aria-label={`تقرير التحليل اللحظي ${v2.symbol}`}>
      <header className="ia-v3-section ia-v3-section--header ia-v3-header">
        <p className="ia-v3-badge">تحليل احترافي بالذكاء الاصطناعي</p>
        <div className="ia-v3-header__main">
          <div className="ia-v3-header__identity">
            <p className="ia-v3-header__symbol">● {v2.symbol}</p>
            <p className="ia-v3-header__price">{formatPrice(market.currentPrice)}</p>
          </div>
          <ul className="ia-v3-header__facts">
            <li>● الفريم: {resultTimeframe ? labelTimeframeLong(resultTimeframe) : "—"}</li>
            <li>● وقت إنشاء التقرير: {v2.generatedAt ? new Date(v2.generatedAt).toLocaleString("ar") : "—"}</li>
            <li>● مدة إنشاء التحليل: {formatDurationMs(durationMs)}</li>
            <li>● الدرجة: {setupQuality.grade || decision.opportunityGrade || "—"}</li>
            <li>● الثقة: {decision.confidence || 0}%</li>
            <li>● الحالة: {labelState(decision.state)}</li>
            <li>● جودة البيانات: {labelDataQuality(v2.data?.quality)}</li>
          </ul>
          <div className="ia-v3-header__meta-grid" aria-hidden="true">
            <HeaderMetric label="الفريم" value={resultTimeframe ? labelTimeframeLong(resultTimeframe) : "—"} />
            <HeaderMetric label="الوقت" value={v2.generatedAt ? new Date(v2.generatedAt).toLocaleString("ar") : "—"} />
            <HeaderMetric label="المدة" value={formatDurationMs(durationMs)} />
            <HeaderMetric label="الدرجة" value={setupQuality.grade || decision.opportunityGrade || "—"} tone="primary" />
            <HeaderMetric label="الثقة" value={`${decision.confidence || 0}%`} tone="primary" />
            <HeaderMetric label="الحالة" value={labelState(decision.state)} tone={decision.state === "avoid" ? "danger" : decision.state === "actionable" ? "success" : "warning"} />
          </div>
        </div>
        <div className="ia-v3-header__actions ia-v3-no-print">
          <button type="button" className="ia-v3-btn" onClick={copyReport} aria-label="نسخ التقرير">نسخ التقرير</button>
          <button type="button" className="ia-v3-btn" onClick={shareReport} aria-label="مشاركة التقرير">مشاركة</button>
          <button type="button" className="ia-v3-btn" onClick={downloadPdf} aria-label="تنزيل PDF">تنزيل PDF</button>
        </div>
      </header>

      <section className="ia-v3-section ia-v3-card ia-v3-card--exec" aria-labelledby="ia-exec-title">
        <h2 id="ia-exec-title" className="ia-v3-card__title">الخلاصة التنفيذية</h2>
        <div className="ia-v3-exec">
          {executiveSummary.split("\n").map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      <section className={`ia-v3-section ia-v3-card ia-v3-decision ia-v3-decision--hero ia-v3-decision--${card.tone}`} aria-labelledby="ia-decision-title">
        <h2 id="ia-decision-title" className="ia-v3-card__title">القرار</h2>
        <p className="ia-v3-decision__headline">
          <span className="ia-v3-decision__emoji" aria-hidden="true">{card.emoji}</span>
          <strong className="ia-v3-decision__title">{card.title}</strong>
        </p>
        <div className="ia-v3-decision__block">
          <h3>سبب القرار</h3>
          <p>{decision.primaryReason || "—"}</p>
        </div>
        <div className="ia-v3-decision__block ia-v3-decision__block--action">
          <h3>الإجراء المقترح</h3>
          <p>{suggestedAction}</p>
        </div>
      </section>

      <section className="ia-v3-section ia-v3-chart-section" aria-label="الرسم البياني">
        <InstantAnalysisLightweightChart
          analysisId={v2.analysisId}
          candles={v2.chart?.candles || []}
          annotations={v2.chart?.annotations || []}
          symbol={v2.symbol}
          timeframeLabel={resultTimeframe ? labelTimeframeLong(resultTimeframe) : "—"}
        />
      </section>

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-plan-title">
        <h2 id="ia-plan-title" className="ia-v3-card__title">خطة التداول</h2>
        <TradePlanTable plan={plan} decision={decision} expectedMove={expectedMove} />
      </section>

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-trend-title">
        <h2 id="ia-trend-title" className="ia-v3-card__title">الاتجاه العام</h2>
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

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-quality-title">
        <h2 id="ia-quality-title" className="ia-v3-card__title">جودة الإعداد</h2>
        <div className="ia-v3-setup-quality">
          <div className="ia-v3-setup-quality__grade">{setupQuality.grade || decision.opportunityGrade || "—"}</div>
          <div className="ia-v3-setup-quality__score">
            <strong>{setupQuality.score || 0}</strong>
            <span>/100</span>
            <div className="ia-v3-progress" role="progressbar" aria-valuenow={setupQuality.score || 0} aria-valuemin={0} aria-valuemax={100}>
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

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-evidence-title">
        <h2 id="ia-evidence-title" className="ia-v3-card__title">الأدلة الفنية</h2>
        <div className="ia-v3-evidence-list">
          {(v2.evidence || []).map((item) => (
            <EvidenceRow key={`${item.type}-${item.label}`} item={item} />
          ))}
        </div>
      </section>

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-scenarios-title">
        <h2 id="ia-scenarios-title" className="ia-v3-card__title">السيناريوهات</h2>
        <div className="ia-v3-scenarios">
          {scenarios.map((scenario, index) => (
            <div key={scenario.title || index} className="ia-v3-scenario">
              <div className="ia-v3-scenario__head">
                <strong>{index === 0 ? "السيناريو الأساسي" : "السيناريو البديل"}</strong>
                <span>الاحتمال {scenario.probability}%</span>
              </div>
              <p className="ia-v3-scenario__title">{scenario.title}</p>
              <div className="ia-v3-progress ia-v3-progress--scenario" role="progressbar" aria-valuenow={scenario.probability} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${scenario.probability}%` }} />
              </div>
              <p>{scenario.invalidation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ia-v3-section ia-v3-card" aria-labelledby="ia-tf-title">
        <h2 id="ia-tf-title" className="ia-v3-card__title">مقارنة الفريمات</h2>
        <div className="ia-v3-tf-table-wrap">
          <table className="ia-v3-tf-table">
            <thead>
              <tr>
                {TREND_TABLE_TIMEFRAMES.map((tf) => (
                  <th key={tf} scope="col">{labelTimeframe(tf)}</th>
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

      <section className="ia-v3-section ia-v3-card ia-v3-risk" aria-labelledby="ia-risk-title">
        <h2 id="ia-risk-title" className="ia-v3-card__title">إدارة المخاطر</h2>
        <div className="ia-v3-table-wrap">
          <table className="ia-v3-trade-table">
            <tbody>
              <tr><th scope="row">حجم المخاطرة المقترح</th><td>{v2.riskManagement?.suggestedRiskPercent || 0}%</td></tr>
              <tr><th scope="row">السبب</th><td>{plan.isActionable ? "صفقة قابلة للتنفيذ ضمن حدود المخاطرة التعليمية" : "لا توجد صفقة جاهزة حالياً"}</td></tr>
              <tr><th scope="row">أفضل طريقة للإدارة</th><td>{v2.riskManagement?.note || "—"}</td></tr>
              <tr><th scope="row">متى يتم الإلغاء</th><td>{plan.invalidation?.condition || v2.scenarios?.primary?.invalidation || "عند إبطال الهيكل الحالي"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="ia-v3-section ia-v3-card ia-v3-explanation" aria-labelledby="ia-expl-title">
        <h2 id="ia-expl-title" className="ia-v3-card__title">الشرح المؤسسي</h2>
        <div className="ia-v3-explanation__section">
          <h3>الرؤية المؤسسية</h3>
          <p>{v2.explanation?.institutionalView}</p>
        </div>
        <div className="ia-v3-explanation__section">
          <h3>الرؤية الكلاسيكية</h3>
          <p>{v2.explanation?.classicTechnicalView}</p>
        </div>
        <div className="ia-v3-explanation__section">
          <h3>سبب القرار</h3>
          <ul>{(v2.explanation?.whyThisDecision || []).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="ia-v3-explanation__section">
          <h3>ما الذي ننتظره؟</h3>
          <ul>{(v2.explanation?.whatToWaitFor || []).map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </section>

      <footer className="ia-v3-section ia-v3-footer">
        <p>{REPORT_FOOTER_DISCLAIMER}</p>
        {v2.explanation?.riskWarning ? <p className="ia-v3-disclaimer">{v2.explanation.riskWarning}</p> : null}
      </footer>
    </article>
  );
}

export default memo(InstantAnalysisV3Panel);
