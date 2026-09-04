import {
  isLiveChartSymbolSupported,
  normalizeLiveChartSymbol,
  pickLiveChartSymbolMatch,
} from "../lib/live-chart-symbol.js";
import { fetchRegistryFromExchanges } from "../lib/market-data/symbol-registry.js";

const symbols = ["ZECUSDT", "BTCUSDT", "ETHUSDT"];
const registry = await fetchRegistryFromExchanges();

console.log(
  JSON.stringify(
    {
      registryAvailable: registry.available,
      sourceCount: registry.sourceCount,
      lastErrorSafe: registry.lastErrorSafe,
    },
    null,
    2,
  ),
);

for (const sym of symbols) {
  const normalized = normalizeLiveChartSymbol(sym);
  const entry = registry.entries.find((item) => item.symbol === normalized);
  const match = pickLiveChartSymbolMatch(normalized, entry ? [entry] : []);

  console.log(
    JSON.stringify({
      input: sym,
      normalized,
      found: Boolean(entry),
      supportsBinance: entry ? isLiveChartSymbolSupported(entry) : false,
      supportedExchanges: entry?.supportedExchanges || [],
      liveChartMatch: match,
      tradingViewSymbol: match ? `BINANCE:${match}` : null,
    }),
  );

  if (!match || !isLiveChartSymbolSupported(entry)) {
    console.error(`integration check failed for ${sym}`);
    process.exit(1);
  }
}

console.log("live chart symbol integration tests passed: 3/3");
