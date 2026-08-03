"use client";

import { memo, useEffect, useMemo, useRef } from "react";

const COLORS = {
  background: "#0B1220",
  surface: "#111827",
  grid: "#1E293B",
  text: "#94A3B8",
  up: "#16A34A",
  down: "#DC2626",
  entry: "#2563EB",
  stop: "#DC2626",
  target: "#22C55E",
  bos: "#F59E0B",
  choch: "#FBBF24",
  supply: "#DC2626",
  demand: "#16A34A",
  ob: "#A78BFA",
  fvg: "#6366F1",
  liquidity: "#38BDF8",
};

const LEGEND_ITEMS = [
  { key: "ENTRY", label: "الدخول", color: COLORS.entry },
  { key: "STOP", label: "وقف الخسارة", color: COLORS.stop },
  { key: "TARGET", label: "الأهداف", color: COLORS.target },
  { key: "BOS", label: "كسر الهيكل", color: COLORS.bos },
  { key: "CHOCH", label: "تغير السلوك", color: COLORS.choch },
  { key: "SUPPLY", label: "منطقة عرض", color: COLORS.supply },
  { key: "DEMAND", label: "منطقة طلب", color: COLORS.demand },
  { key: "ORDER_BLOCK", label: "كتلة أوامر", color: COLORS.ob },
  { key: "FVG", label: "فجوة قيمة", color: COLORS.fvg },
  { key: "LIQUIDITY", label: "سحب سيولة", color: COLORS.liquidity },
];

function annotationColor(type) {
  if (type === "ENTRY") return COLORS.entry;
  if (type === "STOP") return COLORS.stop;
  if (type === "TARGET") return COLORS.target;
  if (type === "BOS") return COLORS.bos;
  if (type === "CHOCH") return COLORS.choch;
  if (type === "SUPPLY") return COLORS.supply;
  if (type === "DEMAND") return COLORS.demand;
  if (type === "ORDER_BLOCK") return COLORS.ob;
  if (type === "FVG") return COLORS.fvg;
  if (type === "LIQUIDITY") return COLORS.liquidity;
  return COLORS.text;
}

function toSeriesCandles(candles) {
  const sorted = [...(candles || [])]
    .filter((c) => Number.isFinite(c?.open) && Number.isFinite(c?.close) && c?.time)
    .sort((a, b) => a.time - b.time);

  const seen = new Map();
  return sorted.map((candle) => {
    let time = Math.floor(Number(candle.time) / 1000);
    while (seen.has(time)) time += 1;
    seen.set(time, true);
    return {
      time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    };
  });
}

function addPriceLine(series, price, color, title, lineStyle = 0) {
  if (!Number.isFinite(price)) return;
  series.createPriceLine({
    price,
    color,
    lineWidth: 2,
    lineStyle,
    axisLabelVisible: true,
    title,
  });
}

function addZoneLines(series, from, to, color, label) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return;
  addPriceLine(series, from, color, `${label} (علوي)`, 2);
  addPriceLine(series, to, color, `${label} (سفلي)`, 2);
}

export default memo(function InstantAnalysisLightweightChart({
  candles,
  annotations,
  symbol,
  timeframeLabel,
  analysisId,
}) {
  const containerRef = useRef(null);
  const legendKeys = useMemo(() => {
    const keys = new Set((annotations || []).map((item) => item.type));
    return LEGEND_ITEMS.filter((item) => keys.has(item.key));
  }, [annotations]);

  const chartSignature = useMemo(
    () => `${analysisId || symbol}:${(candles || []).length}:${timeframeLabel}`,
    [analysisId, symbol, candles, timeframeLabel]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const seriesCandles = toSeriesCandles(candles);
    if (seriesCandles.length < 8) return undefined;

    let chart;
    let resizeObserver;
    let disposed = false;

    void import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineStyle }) => {
      if (disposed || !containerRef.current) return;

      const deviceRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      chart = createChart(container, {
        width: container.clientWidth,
        height: Math.max(360, Math.min(520, Math.round(container.clientWidth * 0.48))),
        layout: {
          background: { type: ColorType.Solid, color: COLORS.background },
          textColor: COLORS.text,
          fontFamily: "Segoe UI, Tahoma, Arial, sans-serif",
        },
        grid: {
          vertLines: { color: COLORS.grid },
          horzLines: { color: COLORS.grid },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#475569", width: 1, style: LineStyle.Dashed },
          horzLine: { color: "#475569", width: 1, style: LineStyle.Dashed },
        },
        rightPriceScale: {
          borderColor: COLORS.grid,
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
        timeScale: {
          borderColor: COLORS.grid,
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
      });

      candleSeries.setData(seriesCandles);

      for (const ann of annotations || []) {
        const color = annotationColor(ann.type);
        const label = ann.label || LEGEND_ITEMS.find((item) => item.key === ann.type)?.label || ann.type;

        if (ann.type === "BOS" || ann.type === "CHOCH" || ann.type === "STOP" || ann.type === "LIQUIDITY") {
          addPriceLine(candleSeries, ann.price, color, label, ann.type === "LIQUIDITY" ? LineStyle.Dotted : LineStyle.Solid);
        }

        if (ann.type === "TARGET") {
          addPriceLine(candleSeries, ann.price, color, label, LineStyle.Dashed);
        }

        if (ann.type === "ENTRY") {
          addZoneLines(candleSeries, ann.from, ann.to, color, label);
        }

        if (ann.type === "ORDER_BLOCK" || ann.type === "FVG" || ann.type === "DEMAND" || ann.type === "SUPPLY") {
          addZoneLines(candleSeries, ann.from, ann.to, color, label);
        }
      }

      chart.timeScale().fitContent();

      const resize = () => {
        if (!containerRef.current || !chart) return;
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: Math.max(360, Math.min(520, Math.round(containerRef.current.clientWidth * 0.48))),
        });
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      chart.applyOptions({ autoSize: false });
      if (deviceRatio > 1) {
        chart.applyOptions({ width: container.clientWidth });
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chart?.remove();
    };
  }, [annotations, candles, chartSignature]);

  if (!Array.isArray(candles) || candles.length < 8) {
    return (
      <div className="ia-v3-chart-empty">
        <p>لا تتوفر بيانات شموع كافية لعرض الرسم.</p>
      </div>
    );
  }

  return (
    <figure className="ia-v3-chart-wrap">
      <div className="ia-v3-chart-head">
        <strong>{symbol}</strong>
        <span>{timeframeLabel}</span>
        <span>{candles.length} شمعة</span>
      </div>
      <div ref={containerRef} className="ia-v3-lwc" role="img" aria-label={`رسم شموع ${symbol}`} />
      {legendKeys.length ? (
        <figcaption className="ia-v3-legend">
          {legendKeys.map((item) => (
            <span key={item.key} className="ia-v3-legend__item">
              <i style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
});
