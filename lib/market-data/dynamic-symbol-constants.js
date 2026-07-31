/** Dynamic symbol subscription policy — env migration deferred to Phase C */

export const MAX_ACTIVE_DYNAMIC_SYMBOLS = 20;
export const IDLE_TTL_MS = 5 * 60 * 1000;
export const MAX_SYMBOLS_PER_CLIENT = 3;
export const MIN_SUPPORTED_EXCHANGES = 2;
export const SYMBOL_CHANGE_RATE_LIMIT = 10;
export const SYMBOL_CHANGE_RATE_WINDOW_MS = 60 * 1000;

export const REGISTRY_CACHE_TTL_MS = 30 * 60 * 1000;
export const REGISTRY_STALE_MAX_MS = 2 * 60 * 60 * 1000;

export const HISTORY_ACTIVATION_MS = 10 * 60 * 1000;

export const CORE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

export const PRIORITY_BASES = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "LTC",
  "DOT",
  "MATIC",
  "TRX",
  "SHIB",
  "PEPE",
];

export const DISPLAY_NAME_MAP = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "Ripple",
  BNB: "BNB",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  LTC: "Litecoin",
  DOT: "Polkadot",
  MATIC: "Polygon",
  TRX: "TRON",
  SHIB: "Shiba Inu",
  PEPE: "Pepe",
};

export const EXCHANGE_FETCH_TIMEOUT_MS = 8000;
