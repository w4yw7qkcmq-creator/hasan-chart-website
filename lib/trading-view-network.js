import { TRADING_VIEW_DNS_ORIGINS } from "./external-origin-hints";

export const TRADING_VIEW_SINGLE_QUOTE_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";

let tradingViewNetworkWarmed = false;
let tradingViewEmbedScriptPromise = null;
let tradingViewEmbedStagger = 0;

export function warmupTradingViewNetwork() {
  if (typeof document === "undefined" || tradingViewNetworkWarmed) {
    return;
  }

  tradingViewNetworkWarmed = true;

  for (const href of TRADING_VIEW_DNS_ORIGINS) {
    if (!document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  }
}

export function loadTradingViewEmbedScriptOnce() {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.__hcTradingViewEmbedReady) {
    return Promise.resolve(true);
  }

  if (tradingViewEmbedScriptPromise) {
    return tradingViewEmbedScriptPromise;
  }

  const existing = document.querySelector(
    'script[data-hc-tradingview-embed="single-quote"]'
  );

  if (existing) {
    window.__hcTradingViewEmbedReady = true;
    return Promise.resolve(true);
  }

  tradingViewEmbedScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TRADING_VIEW_SINGLE_QUOTE_SRC;
    script.async = true;
    script.dataset.hcTradingviewEmbed = "single-quote";
    script.onload = () => {
      window.__hcTradingViewEmbedReady = true;
      resolve(true);
    };
    script.onerror = () => {
      tradingViewEmbedScriptPromise = null;
      reject(new Error("TradingView embed script failed to load"));
    };
    document.head.appendChild(script);
  });

  return tradingViewEmbedScriptPromise;
}

export function scheduleTradingViewEmbed(callback, { timeoutMs = 1200, staggerMs = 120 } = {}) {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;

  const run = () => {
    if (!cancelled) {
      warmupTradingViewNetwork();
      const delay = tradingViewEmbedStagger;
      tradingViewEmbedStagger += staggerMs;
      window.setTimeout(() => {
        if (!cancelled) {
          callback();
        }
      }, delay);
    }
  };

  let idleId = null;
  let timerId = null;

  if (typeof window.requestIdleCallback === "function") {
    idleId = window.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    timerId = window.setTimeout(run, 120);
  }

  return () => {
    cancelled = true;

    if (idleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }

    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
  };
}
