import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ui = readFileSync(join(process.cwd(), "app/components/order-book/order-book-ui.js"), "utf8");
const page = readFileSync(join(process.cwd(), "app/components/order-book/OrderBookPageContent.js"), "utf8");

assert.match(ui, /\/api\/market-symbols/);
assert.match(ui, /debounceRef/);
assert.match(ui, /AbortController/);
assert.match(ui, /placeholder="ابحث عن عملة USDT/);
assert.match(ui, /supportedExchangeCount/);
assert.match(ui, /ArrowDown/);
assert.match(ui, /Escape/);

assert.match(page, /useSearchParams/);
assert.match(page, /symbolSwitching/);
assert.match(page, /handleSymbolChange/);
assert.match(page, /expectedExchangeCount/);
assert.match(page, /historyCollecting/);
assert.match(page, /جاري تحميل/);
assert.match(page, /symbolRateLimitMessage/);
assert.match(page, /router\.replace\("\/order-book\?symbol=BTCUSDT"/);
assert.match(page, /تعذّر تحميل قائمة العملات حاليًا/);

console.log("order-book dynamic symbol ui tests passed: 14/14");
