"use client";

import { useState } from "react";

function stateLabel(state) {
  if (state === "actionable") return "قابل للتنفيذ";
  if (state === "avoid") return "تجنب";
  return "انتظار";
}

function directionLabel(direction) {
  if (direction === "long") return "شراء";
  if (direction === "short") return "بيع";
  return "محايد";
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function EvidenceCard({ item }) {
  const statusClass =
    item.status === "confirmed"
      ? "ia-v2-evidence--confirmed"
      : item.status === "conflicting"
        ? "ia-v2-evidence--conflict"
        : item.status === "partial"
          ? "ia-v2-evidence--partial"
          : "ia-v2-evidence--absent";

  return (
    <div className={`ia-v2-evidence ${statusClass}`}>
      <div className="ia-v2-evidence__head">
        <strong>{item.label}</strong>
        <span>{item.status}</span>
      </div>
      <p>{item.description}</p>
    </div>
  );
}

export default function InstantAnalysisV2Panel({ result }) {
  const v2 = result?.v2 || result;
  const [showDetails, setShowDetails] = useState(true);

  const copySummary = async () => {
    const text = [
      v2.explanation?.executiveSummary,
      v2.explanation?.institutionalView,
      v2.explanation?.riskWarning,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const plan = v2.tradePlan || {};
  const decision = v2.decision || {};
  const market = v2.market || {};

  const badgeClass =
    decision.state === "actionable"
      ? "ia-v2-badge--actionable"
      : decision.state === "avoid"
        ? "ia-v2-badge--avoid"
        : "ia-v2-badge--wait";

  const news = v2.newsRisk;
  const showNews = news && (news.status === "caution" || news.status === "high");

  return (
    <div className="ia-v2" dir="rtl">
      <header className="ia-v2-header">
        <div>
          <p className="ia-v2-eyebrow">Instant Analysis v2 Enterprise</p>
          <h3 className="ia-v2-title">{v2.symbol}</h3>
          <p className="ia-v2-sub">
            {directionLabel(decision.direction)} · {market.trend} · {formatPrice(market.currentPrice)}
          </p>
          <p className="ia-v2-meta">
            {v2.generatedAt ? new Date(v2.generatedAt).toLocaleString("ar") : "—"} · جودة البيانات: {v2.data?.quality || "—"}
          </p>
        </div>
        <span className={`ia-v2-badge ${badgeClass}`}>{stateLabel(decision.state)}</span>
      </header>

      <div className="ia-v2-metrics">
        <div className="ia-v2-metric"><span>الاتجاه العام</span><strong>{market.higherTimeframeTrend}</strong></div>
        <div className="ia-v2-metric"><span>قوة الاتجاه</span><strong>{market.trendStrength}/10</strong></div>
        <div className="ia-v2-metric"><span>درجة الفرصة</span><strong>{decision.opportunityGrade}</strong></div>
        <div className="ia-v2-metric"><span>الثقة</span><strong>{decision.confidence}%</strong></div>
        <div className="ia-v2-metric"><span>المخاطرة</span><strong>{decision.riskLevel}</strong></div>
        <div className="ia-v2-metric"><span>حالة السوق</span><strong>{market.marketState}</strong></div>
      </div>

      {showNews ? (
        <div className={`ia-v2-news ia-v2-news--${news.status}`}>
          <strong>تنبيه أخبار اقتصادية</strong>
          <p>{news.message}</p>
          {news.nextHighImpactEvent ? <p>{news.nextHighImpactEvent}</p> : null}
        </div>
      ) : null}

      <section className="ia-v2-card">
        <h4>القرار الحالي</h4>
        <p className="ia-v2-decision">{decision.primaryReason}</p>
        {decision.waitReason ? <p className="ia-v2-wait">{decision.waitReason}</p> : null}
      </section>

      <section className="ia-v2-card">
        <h4>خطة التداول</h4>
        {plan.isActionable ? (
          <div className="ia-v2-plan-grid">
            <div><span>منطقة الدخول</span><strong>{formatPrice(plan.entryZone?.from)} – {formatPrice(plan.entryZone?.to)}</strong></div>
            <div><span>Stop Loss</span><strong>{formatPrice(plan.stopLoss)}</strong></div>
            {(plan.targets || []).map((tp) => (
              <div key={tp.label}><span>{tp.label}</span><strong>{formatPrice(tp.price)} (RR {tp.rr})</strong></div>
            ))}
            <div><span>التفعيل</span><strong>{plan.trigger}</strong></div>
            <div><span>الإبطال</span><strong>{plan.invalidation?.condition}</strong></div>
          </div>
        ) : (
          <p className="ia-v2-no-trade">لا توجد صفقة جاهزة الآن</p>
        )}
      </section>

      <section className="ia-v2-card">
        <h4>السيناريوهات</h4>
        <div className="ia-v2-scenarios">
          {[v2.scenarios?.primary, v2.scenarios?.alternative].filter(Boolean).map((s) => (
            <div key={s.title} className="ia-v2-scenario">
              <div className="ia-v2-scenario__head">
                <strong>{s.title}</strong>
                <span>{s.probability}%</span>
              </div>
              <div className="ia-v2-bar"><div style={{ width: `${s.probability}%` }} /></div>
              <p>{s.invalidation}</p>
            </div>
          ))}
        </div>
      </section>

      {showDetails ? (
        <section className="ia-v2-card">
          <h4>الأدلة الفنية</h4>
          <div className="ia-v2-evidence-grid">
            {(v2.evidence || []).map((item) => (
              <EvidenceCard key={`${item.type}-${item.label}`} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {v2.chart?.image ? (
        <figure className="ia-v2-chart">
          <img src={v2.chart.image} alt={v2.chart.alt || `Chart ${v2.symbol}`} className="ia-v2-chart__img" />
        </figure>
      ) : null}

      <section className="ia-v2-card">
        <h4>الشرح المؤسسي</h4>
        <p>{v2.explanation?.executiveSummary}</p>
        <p>{v2.explanation?.institutionalView}</p>
        <p>{v2.explanation?.classicTechnicalView}</p>
        <ul>
          {(v2.explanation?.whyThisDecision || []).map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className="ia-v2-disclaimer">{v2.explanation?.riskWarning}</p>
      </section>

      <section className="ia-v2-card">
        <h4>إدارة المخاطر</h4>
        <p>نسبة مخاطرة مقترحة: {v2.riskManagement?.suggestedRiskPercent}%</p>
        <p>{v2.riskManagement?.note}</p>
      </section>

      <div className="ia-v2-actions">
        <button type="button" className="user-dashboard-btn user-dashboard-btn--ghost" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? "إخفاء التفاصيل" : "إظهار التفاصيل"}
        </button>
        <button type="button" className="user-dashboard-btn user-dashboard-btn--ghost" onClick={copySummary}>
          نسخ الملخص
        </button>
        {v2.chart?.image ? (
          <a href={v2.chart.image} download={`${v2.symbol}-analysis.svg`} className="user-dashboard-btn user-dashboard-btn--ghost">
            تنزيل الشارت
          </a>
        ) : null}
      </div>
    </div>
  );
}
