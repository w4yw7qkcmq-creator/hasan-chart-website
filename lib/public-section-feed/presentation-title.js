/** Presentation-only title from Telegram body — stored body is never modified. */
export function deriveTelegramPresentationTitle(body, displayTitle = "") {
  const fromDisplay = String(displayTitle || "").trim();
  if (fromDisplay) return fromDisplay.slice(0, 200);

  const text = String(body || "").trim();
  if (!text) return "منشور Telegram";

  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || text;
  return firstLine.trim().slice(0, 200);
}
