"use client";
function RealCandlestickChart({ result }) {
  const candles = Array.isArray(result?.chartData)
    ? result.chartData.slice(-70)
    : [];
  if (candles.length < 5) {
    return null;
  }
  const width = 1180;
  const height = 620;
  const padding = { top: 70, right: 92, bottom: 90, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const highs = candles
    .map((candle) => Number(candle.high))
    .filter(Number.isFinite);
  const lows = candles
    .map((candle) => Number(candle.low))
    .filter(Number.isFinite);
  const maxRaw = Math.max(...highs, Number(result?.resistance || 0));
  const minRaw = Math.min(...lows, Number(result?.support || Infinity));
  const extra = Math.max(
    (maxRaw - minRaw) * 0.14,
    Math.abs(maxRaw) * 0.002 || 1,
  );
  const maxPrice = maxRaw + extra;
  const minPrice = minRaw - extra;
  const priceRange = Math.max(
    maxPrice - minPrice,
    Math.abs(maxPrice) * 0.01 || 1,
  );
  const toY = (price) =>
    padding.top + ((maxPrice - Number(price)) / priceRange) * chartHeight;
  const candleStep = chartWidth / Math.max(candles.length - 1, 1);
  const candleWidth = Math.max(5, Math.min(16, candleStep * 0.55));
  const direction = String(
    result?.direction || result?.trend || result?.marketBias || "neutral",
  ).toLowerCase();
  const isBearish = direction.includes("bear");
  const isBullish = direction.includes("bull");
  const biasText = isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral";
  const signals = Array.isArray(result?.signals)
    ? result.signals.slice(0, 4)
    : [];
  const currentPrice = Number(
    result?.currentPrice || candles[candles.length - 1]?.close || 0,
  );
  const currentPriceY = Number.isFinite(currentPrice)
    ? toY(currentPrice)
    : null;
  const resistanceY = Number.isFinite(Number(result?.resistance))
    ? toY(result.resistance)
    : null;
  const supportY = Number.isFinite(Number(result?.support))
    ? toY(result.support)
    : null;
  return (
    <div className="chart-container mt-6 overflow-hidden rounded-[30px] border admin-panel-border ui-page-dark p-3 shadow-[0_0_45px_rgba(34,211,238,0.14)]">
      {" "}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-container h-auto w-full rounded-[24px] ui-page-dark"
        role="img"
        aria-label={`Real candlestick chart for ${result?.symbol || "symbol"}`}
      >
        {" "}
        <defs>
          {" "}
          <linearGradient id="realChartBg" x1="0" y1="0" x2="1" y2="1">
            {" "}
            <stop offset="0%" stopColor="#020617" />{" "}
            <stop offset="55%" stopColor="#07142f" />{" "}
            <stop offset="100%" stopColor="#020617" />{" "}
          </linearGradient>{" "}
          <filter id="chartGlow">
            {" "}
            <feGaussianBlur stdDeviation="4" result="blur" />{" "}
            <feMerge>
              {" "}
              <feMergeNode in="blur" /> <feMergeNode in="SourceGraphic" />{" "}
            </feMerge>{" "}
          </filter>{" "}
        </defs>{" "}
        <rect width={width} height={height} rx="28" fill="url(#realChartBg)" />{" "}
        <rect
          x="22"
          y="20"
          width={width - 44}
          height={height - 40}
          rx="26"
          fill="#020817"
          opacity="0.72"
          stroke="#155e75"
          strokeOpacity="0.42"
        />{" "}
        <text x="48" y="52" fill="#ffffff" fontSize="26" fontWeight="900">
          {" "}
          {result?.symbol || "MARKET"} · Professional Market Structure{" "}
        </text>{" "}
        <text x="48" y="82" fill="#67e8f9" fontSize="16" fontWeight="800">
          {" "}
          Real OKX 15m candles · Liquidity · Support / Resistance ·
          Structure{" "}
        </text>{" "}
        <rect
          x={width - 255}
          y="38"
          width="205"
          height="54"
          rx="18"
          fill="#07142f"
          stroke="#22d3ee"
          strokeOpacity="0.38"
        />{" "}
        <text
          x={width - 232}
          y="62"
          fill="#94a3b8"
          fontSize="13"
          fontWeight="700"
        >
          Market Bias
        </text>{" "}
        <text
          x={width - 232}
          y="84"
          fill={isBullish ? "#34d399" : isBearish ? "#fb7185" : "#67e8f9"}
          fontSize="19"
          fontWeight="900"
        >
          {biasText}
        </text>{" "}
        {Array.from({ length: 7 }, (_, index) => {
          const y = padding.top + (chartHeight / 6) * index;
          const price = maxPrice - (priceRange / 6) * index;
          return (
            <g key={`grid-y-${index}`}>
              {" "}
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#94a3b8"
                strokeOpacity="0.12"
              />{" "}
              <text
                x={width - padding.right + 14}
                y={y + 5}
                fill="#94a3b8"
                fontSize="12"
                fontWeight="700"
              >
                {" "}
                {price.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}{" "}
              </text>{" "}
            </g>
          );
        })}{" "}
        {Array.from({ length: 10 }, (_, index) => {
          const x = padding.left + (chartWidth / 9) * index;
          return (
            <line
              key={`grid-x-${index}`}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={height - padding.bottom}
              stroke="#94a3b8"
              strokeOpacity="0.09"
            />
          );
        })}{" "}
        {supportY && (
          <g>
            {" "}
            <rect
              x={padding.left}
              y={supportY - 20}
              width={chartWidth}
              height="40"
              rx="12"
              fill="#064e3b"
              opacity="0.18"
            />{" "}
            <line
              x1={padding.left}
              y1={supportY}
              x2={width - padding.right}
              y2={supportY}
              stroke="#34d399"
              strokeDasharray="10 10"
              strokeOpacity="0.7"
            />{" "}
            <text
              x={padding.left + 12}
              y={supportY - 8}
              fill="#a7f3d0"
              fontSize="14"
              fontWeight="900"
            >
              Support / Demand
            </text>{" "}
          </g>
        )}{" "}
        {resistanceY && (
          <g>
            {" "}
            <rect
              x={padding.left}
              y={resistanceY - 20}
              width={chartWidth}
              height="40"
              rx="12"
              fill="#7f1d1d"
              opacity="0.18"
            />{" "}
            <line
              x1={padding.left}
              y1={resistanceY}
              x2={width - padding.right}
              y2={resistanceY}
              stroke="#fb7185"
              strokeDasharray="10 10"
              strokeOpacity="0.7"
            />{" "}
            <text
              x={padding.left + 12}
              y={resistanceY - 8}
              fill="#fecaca"
              fontSize="14"
              fontWeight="900"
            >
              Resistance / Supply
            </text>{" "}
          </g>
        )}{" "}
        {currentPriceY && (
          <g>
            {" "}
            <line
              x1={padding.left}
              y1={currentPriceY}
              x2={width - padding.right}
              y2={currentPriceY}
              stroke="#67e8f9"
              strokeWidth="2"
              strokeDasharray="6 8"
              strokeOpacity="0.75"
            />{" "}
            <rect
              x={width - padding.right - 170}
              y={currentPriceY - 16}
              width="165"
              height="32"
              rx="10"
              fill="#020817"
              stroke="#67e8f9"
              strokeOpacity="0.55"
            />{" "}
            <text
              x={width - padding.right - 156}
              y={currentPriceY + 5}
              fill="#67e8f9"
              fontSize="14"
              fontWeight="900"
            >
              {" "}
              LIVE{" "}
              {currentPrice.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{" "}
            </text>{" "}
          </g>
        )}{" "}
        <g>
          {" "}
          <rect
            x={padding.left + 14}
            y={padding.top + 14}
            width="380"
            height="128"
            rx="18"
            fill="#020817"
            fillOpacity="0.78"
            stroke="#22d3ee"
            strokeOpacity="0.22"
          />{" "}
          <text
            x={padding.left + 34}
            y={padding.top + 44}
            fill="#e2e8f0"
            fontSize="15"
            fontWeight="900"
          >
            Market Structure Notes
          </text>{" "}
          {(signals.length
            ? signals
            : [result?.bos, result?.choch].filter(Boolean)
          )
            .slice(0, 4)
            .map((signal, index) => (
              <text
                key={`signal-${index}`}
                x={padding.left + 34}
                y={padding.top + 72 + index * 22}
                fill="#cbd5e1"
                fontSize="13"
                fontWeight="700"
              >
                {" "}
                • {signal}{" "}
              </text>
            ))}{" "}
        </g>{" "}
        {candles.map((candle, index) => {
          const x = padding.left + index * candleStep;
          const openY = toY(candle.open);
          const closeY = toY(candle.close);
          const highY = toY(candle.high);
          const lowY = toY(candle.low);
          const isUp = Number(candle.close) >= Number(candle.open);
          const color = isUp ? "#34d399" : "#fb7185";
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));
          return (
            <g
              key={`${candle.time}-${index}`}
              filter={
                index > candles.length - 8 ? "url(#chartGlow)" : undefined
              }
            >
              {" "}
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
              />{" "}
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                rx="3"
                fill={color}
                opacity="0.92"
              />{" "}
            </g>
          );
        })}{" "}
        <text
          x="48"
          y={height - 38}
          fill="#cbd5e1"
          fontSize="14"
          fontWeight="700"
        >
          {" "}
          Real market candles · Structure zones from recent OHLC data ·
          Educational only{" "}
        </text>{" "}
      </svg>{" "}
    </div>
  );
}
export default RealCandlestickChart;
