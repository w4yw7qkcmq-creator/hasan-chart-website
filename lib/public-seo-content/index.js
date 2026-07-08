import partnerCenter from "./pages/partner-center.js";
import subscriptions from "./pages/subscriptions.js";
import accountManagement from "./pages/account-management.js";
import analysisRequest from "./pages/analysis-request.js";
import vipSpot from "./pages/vip-spot.js";
import vipFutures from "./pages/vip-futures.js";
import cryptoAnalysis from "./pages/crypto-analysis.js";
import forexSignals from "./pages/forex-signals.js";
import accountManagementService from "./pages/account-management-service.js";
import tradingAcademy from "./pages/trading-academy.js";
import vipSpotSignals from "./pages/vip-spot-signals.js";
import vipFuturesSignals from "./pages/vip-futures-signals.js";

const pages = [
  partnerCenter,
  subscriptions,
  accountManagement,
  analysisRequest,
  vipSpot,
  vipFutures,
  cryptoAnalysis,
  forexSignals,
  accountManagementService,
  tradingAcademy,
  vipSpotSignals,
  vipFuturesSignals,
];

const PAGE_KEY_OVERRIDES = {
  "/analysis/request": "analysis-request",
};

function resolvePageKey(page) {
  return PAGE_KEY_OVERRIDES[page.path] || page.path.replace(/^\//, "");
}

/** @type {Record<string, typeof partnerCenter>} */
export const PUBLIC_SEO_PAGES = Object.fromEntries(
  pages.map((page) => [resolvePageKey(page), page])
);

/**
 * @param {string} pageKey
 */
export function getPublicSeoPage(pageKey) {
  return PUBLIC_SEO_PAGES[pageKey] || null;
}

export default PUBLIC_SEO_PAGES;
