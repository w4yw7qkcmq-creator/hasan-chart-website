const TELEGRAM_SLUG_PREFIX = /^tg-(da|ac|rs)-/i;

export function isTelegramContentPublicSlug(slug) {
  return TELEGRAM_SLUG_PREFIX.test(String(slug || "").trim());
}

export function telegramSlugPrefixForSection(section) {
  if (section === "daily_analysis") return "tg-da-";
  if (section === "academy") return "tg-ac-";
  if (section === "result") return "tg-rs-";
  return "tg-";
}
