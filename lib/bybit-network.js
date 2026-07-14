let bybitNetworkWarmed = false;

export function warmupBybitNetwork() {
  if (typeof document === "undefined" || bybitNetworkWarmed) {
    return;
  }

  bybitNetworkWarmed = true;
  const href = "https://api.bybit.com";

  if (!document.head.querySelector(`link[rel="dns-prefetch"][href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "dns-prefetch";
    link.href = href;
    document.head.appendChild(link);
  }
}
