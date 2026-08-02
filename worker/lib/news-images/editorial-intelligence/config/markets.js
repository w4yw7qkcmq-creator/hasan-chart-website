const MARKETS = {
  USD: { id: "USD", names: ["USD", "US dollar", "dollar"], visualHint: "subtle US dollar market context" },
  EUR: { id: "EUR", names: ["EUR", "euro"], visualHint: "subtle euro currency market context" },
  GBP: { id: "GBP", names: ["GBP", "pound", "British pound"], visualHint: "subtle British pound market context" },
  JPY: { id: "JPY", names: ["JPY", "yen", "Japanese yen"], visualHint: "subtle Japanese yen market context" },
  GOLD: { id: "GOLD", names: ["gold", "precious metals"], visualHint: "subtle gold market context without price labels" },
  US_TREASURIES: {
    id: "US_TREASURIES",
    names: ["treasuries", "US bonds", "bond market"],
    visualHint: "subtle US Treasury bond market context without readable yields",
  },
  EQUITIES: {
    id: "EQUITIES",
    names: ["equities", "stocks", "stock market"],
    visualHint: "subtle equity market context without readable tickers",
  },
  OIL: { id: "OIL", names: ["oil", "crude"], visualHint: "subtle energy market context" },
  CRYPTO: { id: "CRYPTO", names: ["crypto", "bitcoin"], visualHint: "avoid unless explicitly relevant" },
};

module.exports = { MARKETS };
