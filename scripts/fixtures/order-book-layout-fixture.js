/** Test-only fixture — never served to production UI */

export const EXECUTED_FLOW_FIXTURE = {
  buyNotional: 1_298_400,
  sellNotional: 998_200,
  netNotional: 300_200,
  buyPercent: 56.5,
  sellPercent: 43.5,
  dominanceLabel: "غلبة شراء",
  dominanceClassification: "غلبة شراء",
};

export const LIQUIDITY_WALLS_FIXTURE = {
  bid: {
    price: 97234.5,
    notional: 1_298_000,
    quantity: 13.345,
    distancePercent: 0.42,
    exchange: "binance",
    exchanges: ["binance", "okx"],
  },
  ask: {
    price: 97456.8,
    notional: 999_900,
    quantity: 10.256,
    distancePercent: 0.38,
    exchange: "bybit",
    exchanges: ["bybit", "binance"],
  },
};

export const LARGE_TRADES_FIXTURE = [
  { ts: 1720000000000, exchange: "binance", side: "buy", price: 97234.56789, quantity: 1.3456789, notional: 129_800 },
  { ts: 1720000060000, exchange: "bybit", side: "sell", price: 97100.123456, quantity: 12.987654, notional: 1_260_000 },
  { ts: 1720000120000, exchange: "okx", side: "buy", price: 97300.999999, quantity: 0.987654321, notional: 29_800 },
  { ts: 1720000180000, exchange: "binance", side: "sell", price: 97050.4321, quantity: 5.432109876, notional: 527_000 },
  { ts: 1720000240000, exchange: "bybit", side: "buy", price: 97400.111111, quantity: 2.222222222, notional: 216_500 },
  { ts: 1720000300000, exchange: "okx", side: "sell", price: 96999.888888, quantity: 8.888888888, notional: 862_000 },
  { ts: 1720000360000, exchange: "binance", side: "buy", price: 97500.555555, quantity: 3.333333333, notional: 325_000 },
  { ts: 1720000420000, exchange: "bybit", side: "sell", price: 96888.777777, quantity: 6.666666666, notional: 645_900 },
  { ts: 1720000480000, exchange: "okx", side: "buy", price: 97600.333333, quantity: 4.444444444, notional: 433_800 },
  { ts: 1720000540000, exchange: "binance", side: "sell", price: 96777.666666, quantity: 9.999999999, notional: 967_700 },
  { ts: 1720000600000, exchange: "bybit", side: "buy", price: 97777.121212, quantity: 1.111111111, notional: 108_600 },
  { ts: 1720000660000, exchange: "okx", side: "sell", price: 96666.909090, quantity: 7.777777777, notional: 751_200 },
  { ts: 1720000720000, exchange: "binance", side: "buy", price: 97888.808080, quantity: 2.555555555, notional: 250_100 },
  { ts: 1720000780000, exchange: "bybit", side: "sell", price: 96555.707070, quantity: 11.111111111, notional: 1_072_800 },
  { ts: 1720000840000, exchange: "okx", side: "buy", price: 97999.606060, quantity: 0.555555555, notional: 54_400 },
];

export const FIXTURE_COLUMN_HEADERS = ["الوقت", "المنصة", "الاتجاه", "السعر", "الكمية", "القيمة"];

export const FIXTURE_VALUE_SAMPLES = ["$29.8K", "$129.8K", "$999.9K", "$1.20M"];
