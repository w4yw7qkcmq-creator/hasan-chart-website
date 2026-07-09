export const TRADING_VIEW_DNS_ORIGINS = [
  "https://s3.tradingview.com",
  "https://s.tradingview.com",
];

export function getSupabaseOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://lzgsxdsumnteuwtjfqlm.supabase.co";

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
