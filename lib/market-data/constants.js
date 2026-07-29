export const WS_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
export const MAX_RECONNECT_DELAY_MS = 30000;
export const CONNECT_TIMEOUT_MS = 8000;
export const STALE_THRESHOLD_MS = 15000;
export const UI_BROADCAST_MS = 150;
export const MAX_ORDER_BOOK_LEVELS = 400;
export const DEFAULT_DEPTH_LEVELS = 20;
export const DEPTH_LEVEL_OPTIONS = [10, 20, 50];
export const LIQUIDITY_RANGE_OPTIONS = [0.1, 0.5, 1, 2];
export const DEFAULT_LIQUIDITY_RANGE_PERCENT = 0.5;
export const FLOW_WINDOW_OPTIONS = ["1m", "5m", "15m", "1h", "4h", "12h", "1d", "3d", "7d"];
export const LIVE_FLOW_WINDOWS = new Set(["1m", "5m", "15m", "1h"]);
export const HISTORICAL_FLOW_WINDOWS = ["4h", "12h", "1d", "3d", "7d"];
export const HISTORY_FLOW_API_WINDOWS = ["1h", "4h", "12h", "1d", "3d", "7d"];
export const DEFAULT_FLOW_WINDOW = "5m";
export const LARGE_TRADE_WINDOW_OPTIONS = ["5m", "15m", "1h", "4h", "12h", "1d", "3d", "7d"];
export const LIVE_LARGE_TRADE_WINDOWS = new Set(["5m", "15m", "1h"]);
export const HISTORICAL_LARGE_TRADE_WINDOWS = ["4h", "12h", "1d", "3d", "7d"];
export const HISTORY_LARGE_TRADE_API_WINDOWS = ["4h", "12h", "1d", "3d", "7d"];
export const HISTORICAL_LIQUIDITY_WALL_WINDOWS = ["1h", "4h", "12h", "1d", "3d", "7d"];
export const DEFAULT_LIQUIDITY_WALL_WINDOW = "4h";
export const LIQUIDITY_DEPTH_LIVE_WINDOW = "live";
export const LIQUIDITY_DEPTH_HISTORICAL_WINDOWS = ["1h", "4h", "12h", "1d", "3d", "7d"];
export const LIQUIDITY_DEPTH_WINDOW_OPTIONS = [
  { value: "live", label: "لحظي" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "12h", label: "12h" },
  { value: "1d", label: "1d" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
];
export const DEFAULT_LIQUIDITY_DEPTH_WINDOW = "live";

export function isHistoricalLiquidityDepthWindow(window) {
  return LIQUIDITY_DEPTH_HISTORICAL_WINDOWS.includes(window);
}
export const DEFAULT_LARGE_TRADE_WINDOW = "15m";
export const LARGE_TRADE_THRESHOLDS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
export const DEFAULT_LARGE_TRADE_THRESHOLD = 50_000;
export const DOMINANCE_BUY_THRESHOLD = 55;
export const DOMINANCE_SELL_THRESHOLD = 45;
export const WALL_MEDIAN_MULTIPLIER = 3;
export const WALL_MIN_NOTIONAL_USD = 50_000;
export const FEAR_GREED_CACHE_MS = 15 * 60 * 1000;
export const FEAR_GREED_API_URL = "https://api.alternative.me/fng/?limit=30&format=json";
