import { getSupabaseOrigin } from "./external-origin-hints";

let supabaseNetworkWarmed = false;

export function warmupSupabaseNetwork() {
  if (typeof document === "undefined" || supabaseNetworkWarmed) {
    return;
  }

  const origin = getSupabaseOrigin();
  if (!origin) {
    return;
  }

  supabaseNetworkWarmed = true;

  if (!document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}
