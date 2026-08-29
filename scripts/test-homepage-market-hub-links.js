import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const pageSource = read("app/(public)/page.js");
const clientSource = read("app/(public)/HomePageClient.js");
const linksSource = read("app/components/home/HomeMarketHubLinks.js");

const requiredHrefs = ["/markets", "/gold", "/xauusd", "/forex", "/crypto", "/stocks"];

assert.match(pageSource, /HomeMarketHubLinks/, "homepage must render market hub links server component");
assert.match(pageSource, /marketHubLinks=\{<HomeMarketHubLinks \/>}/, "homepage must pass SSR market hub links slot");
assert.match(clientSource, /marketHubLinks/, "homepage client must render market hub links slot");
assert.match(linksSource, /from "next\/link"/, "market hub links must use Next Link for SSR anchors");

for (const href of requiredHrefs) {
  assert.match(linksSource, new RegExp(`href:\\s*"${href.replace("/", "\\/")}"`), `missing approved destination ${href}`);
}

assert.doesNotMatch(linksSource, /href:\s*"\/xau"/, "must not link redirect alias /xau");
assert.match(linksSource, /label:\s*"سوق الذهب"/, "gold hub label must distinguish broader gold market");
assert.match(linksSource, /label:\s*"XAU\/USD"/, "xauusd label must distinguish pair page");

console.log("test-homepage-market-hub-links: PASS");
