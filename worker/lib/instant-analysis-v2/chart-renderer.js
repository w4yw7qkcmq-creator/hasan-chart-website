const { escapeHtml, formatPrice } = require("./utils");

const CHART_CANDLE_LIMIT = 80;

/**
 * Build render annotations strictly from finalized v2 JSON.
 * No rediscovery of structure inside the renderer.
 */
function buildChartAnnotationsFromResult(result) {
  const annotations = [];
  const plan = result.tradePlan || {};

  if (result.structure?.bos?.detected && Number.isFinite(result.structure.bos.level)) {
    annotations.push({ type: "BOS", price: result.structure.bos.level, label: "BOS" });
  }

  if (result.structure?.choch?.detected && Number.isFinite(result.structure.choch.level)) {
    annotations.push({ type: "CHOCH", price: result.structure.choch.level, label: "CHOCH" });
  }

  for (const ob of result.zones?.orderBlocks || []) {
    if (Number.isFinite(ob.from) && Number.isFinite(ob.to)) {
      annotations.push({ type: "ORDER_BLOCK", from: ob.from, to: ob.to, label: ob.label || "OB" });
    }
  }

  for (const fvg of result.zones?.fairValueGaps || []) {
    if (fvg.status === "filled") continue;
    if (Number.isFinite(fvg.from) && Number.isFinite(fvg.to)) {
      annotations.push({ type: "FVG", from: fvg.from, to: fvg.to, label: `FVG ${fvg.status}` });
    }
  }

  for (const zone of (result.zones?.demand || []).slice(-2)) {
    annotations.push({ type: "DEMAND", from: zone.from, to: zone.to, label: zone.label || "Demand" });
  }

  for (const zone of (result.zones?.supply || []).slice(-2)) {
    annotations.push({ type: "SUPPLY", from: zone.from, to: zone.to, label: zone.label || "Supply" });
  }

  for (const pool of [...(result.liquidity?.buySideLiquidity || []), ...(result.liquidity?.sellSideLiquidity || [])].slice(0, 2)) {
    if (Number.isFinite(pool.price)) {
      annotations.push({ type: "LIQUIDITY", price: pool.price, label: pool.label || "Liquidity" });
    }
  }

  if (plan.isActionable && result.decision?.state === "actionable") {
    if (plan.entryZone) {
      annotations.push({ type: "ENTRY", from: plan.entryZone.from, to: plan.entryZone.to, label: "Entry" });
    }
    if (Number.isFinite(plan.stopLoss)) {
      annotations.push({ type: "STOP", price: plan.stopLoss, label: "SL" });
    }
    (plan.targets || []).forEach((tp) => {
      if (Number.isFinite(tp.price)) {
        annotations.push({ type: "TARGET", price: tp.price, label: tp.label || "TP" });
      }
    });
  }

  if (Number.isFinite(result.market?.currentPrice)) {
    annotations.push({ type: "CURRENT", price: result.market.currentPrice, label: "Current" });
  }

  return annotations;
}

function buildAnnotatedChartSvg(result, executionCandles) {
  const candles = Array.isArray(executionCandles) ? executionCandles.slice(-CHART_CANDLE_LIMIT) : [];
  if (candles.length < 8) return null;

  const annotations = buildChartAnnotationsFromResult(result);

  const width = 1280;
  const height = 760;
  const pad = { top: 110, right: 120, bottom: 90, left: 88 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const prices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
  for (const ann of annotations) {
    if (Number.isFinite(ann.price)) prices.push(ann.price);
    if (Number.isFinite(ann.from)) prices.push(ann.from);
    if (Number.isFinite(ann.to)) prices.push(ann.to);
  }

  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const padPx = (max - min) * 0.08 || max * 0.01;
  min -= padPx;
  max += padPx;
  const range = Math.max(max - min, 1e-8);

  const toY = (p) => pad.top + ((max - p) / range) * chartH;
  const step = chartW / Math.max(candles.length - 1, 1);
  const candleW = Math.max(4, Math.min(14, step * 0.55));

  const candleSvg = candles
    .map((c, i) => {
      const x = pad.left + i * step;
      const up = c.close >= c.open;
      const color = up ? "#34d399" : "#fb7185";
      const bodyY = toY(Math.max(c.open, c.close));
      const bodyH = Math.max(2, Math.abs(toY(c.open) - toY(c.close)));
      return `<line x1="${x}" y1="${toY(c.high)}" x2="${x}" y2="${toY(c.low)}" stroke="${color}" stroke-width="3"/>
        <rect x="${x - candleW / 2}" y="${bodyY}" width="${candleW}" height="${bodyH}" rx="2" fill="${color}"/>`;
    })
    .join("");

  const zoneRect = (from, to, color, label) => {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
    const y1 = toY(Math.max(from, to));
    const y2 = toY(Math.min(from, to));
    return `<rect x="${pad.left}" y="${y1}" width="${chartW}" height="${Math.max(6, y2 - y1)}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-opacity="0.35"/>
      <text x="${pad.left + 8}" y="${y1 + 16}" fill="${color}" font-size="13" font-weight="700">${escapeHtml(label)}</text>`;
  };

  const levelLine = (price, color, label, dash = "8 6") => {
    if (!Number.isFinite(price)) return "";
    const y = toY(price);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>
      <text x="${width - pad.right + 6}" y="${y + 4}" fill="${color}" font-size="12" font-weight="700">${escapeHtml(label)} ${formatPrice(price)}</text>`;
  };

  let overlaySvg = "";
  for (const ann of annotations) {
    if (ann.type === "ORDER_BLOCK") overlaySvg += zoneRect(ann.from, ann.to, "#a78bfa", ann.label);
    if (ann.type === "FVG") overlaySvg += zoneRect(ann.from, ann.to, "#6366f1", ann.label);
    if (ann.type === "DEMAND") overlaySvg += zoneRect(ann.from, ann.to, "#34d399", ann.label);
    if (ann.type === "SUPPLY") overlaySvg += zoneRect(ann.from, ann.to, "#fb7185", ann.label);
    if (ann.type === "BOS") overlaySvg += levelLine(ann.price, "#fbbf24", ann.label);
    if (ann.type === "CHOCH") overlaySvg += levelLine(ann.price, "#fde68a", ann.label);
    if (ann.type === "LIQUIDITY") overlaySvg += levelLine(ann.price, "#94a3b8", ann.label, "4 8");
    if (ann.type === "ENTRY") overlaySvg += zoneRect(ann.from, ann.to, "#38bdf8", ann.label);
    if (ann.type === "STOP") overlaySvg += levelLine(ann.price, "#f87171", ann.label);
    if (ann.type === "TARGET") overlaySvg += levelLine(ann.price, "#a78bfa", ann.label);
    if (ann.type === "CURRENT") overlaySvg += levelLine(ann.price, "#ffffff", ann.label, "2 4");
  }

  const decision = result.decision || {};
  const biasColor = decision.direction === "long" ? "#34d399" : decision.direction === "short" ? "#fb7185" : "#22d3ee";
  const firstClose = candles[0]?.close;
  const lastClose = candles[candles.length - 1]?.close;

  const svg = `<!-- ia-v2-chart candles=${candles.length} firstClose=${firstClose} lastClose=${lastClose} current=${result.market?.currentPrice} -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#020617"/>
  <text x="${pad.left}" y="48" fill="#fff" font-size="28" font-weight="900">HasaN CharT World · ${escapeHtml(result.symbol)} · 15m</text>
  <text x="${pad.left}" y="78" fill="#67e8f9" font-size="16">${escapeHtml(result.generatedAt || "")} · ${escapeHtml(decision.opportunityGrade || "")} · Confidence ${decision.confidence || 0}%</text>
  <text x="${width - pad.right - 180}" y="48" fill="#94a3b8" font-size="15">Current</text>
  <text x="${width - pad.right - 180}" y="78" fill="#fff" font-size="24" font-weight="900">${formatPrice(result.market?.currentPrice)}</text>
  ${Array.from({ length: 6 }, (_, i) => {
    const y = pad.top + (chartH / 5) * i;
    const price = max - (range / 5) * i;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#334155" stroke-opacity="0.35"/>
      <text x="${width - pad.right + 8}" y="${y + 4}" fill="#64748b" font-size="11">${formatPrice(price)}</text>`;
  }).join("")}
  ${overlaySvg}
  ${candleSvg}
  <rect x="${pad.left}" y="${height - 72}" width="420" height="48" rx="14" fill="#0f172a" stroke="${biasColor}" stroke-opacity="0.6"/>
  <text x="${pad.left + 16}" y="${height - 42}" fill="${biasColor}" font-size="18" font-weight="800">${escapeHtml(decision.state || "wait")} · ${escapeHtml(decision.direction || "neutral")}</text>
  <text x="${pad.left}" y="${height - 16}" fill="#94a3b8" font-size="13">Real OKX OHLC · Educational only</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function buildChartPayload(result, executionCandles) {
  const candles = executionCandles.slice(-CHART_CANDLE_LIMIT);
  const annotations = buildChartAnnotationsFromResult(result);

  return {
    image: buildAnnotatedChartSvg(result, candles),
    candles,
    candleCount: candles.length,
    annotations,
    alt: `Instant Analysis v2 chart for ${result.symbol}`,
  };
}

module.exports = {
  CHART_CANDLE_LIMIT,
  buildChartAnnotationsFromResult,
  buildAnnotatedChartSvg,
  buildChartPayload,
};
