const { stripPromotionalFooter, isPromotionOnly } = require("./promo-filter");

function decodeTelegramHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTelegramSourceText(value) {
  const withoutFooter = stripPromotionalFooter(
    String(value || "")
      .replace(/https?:\/\/t\.me\/\S+/gi, "")
      .replace(/Telegram\.me\/?\S*/gi, "")
      .replace(/@ForexBreakingNews/gi, "")
      .replace(/@ForexNewspaper/gi, "")
      .replace(/ForexBreakingNews/gi, "")
      .replace(/ForexNewspaper/gi, "")
      .replace(/JOIN OUR CHANNEL/gi, "")
      .replace(/SUBSCRIBE/gi, "")
      .replace(/Follow us/gi, "")
      .replace(/Breaking News/gi, "")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/#[^\s#]+/g, "")
  );

  return withoutFooter
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPromotionalTelegramMessage(text) {
  return isPromotionOnly(text);
}

function parseTelegramChannelHtml(html, channel, stats = null) {
  const content = String(html || "");
  const messages = [];
  const widgetPattern =
    /data-post="([^"]+)"[\s\S]*?tgme_widget_message_text js-message_text[\s\S]*?>([\s\S]*?)<\/div>[\s\S]*?<time datetime="([^"]+)"/gi;

  for (const match of content.matchAll(widgetPattern)) {
    const dataPost = match[1];
    const rawHtml = match[2];
    const publishedAt = match[3];
    const rawDecoded = decodeTelegramHtml(rawHtml);
    const hadPromoFooter = rawDecoded !== stripPromotionalFooter(rawDecoded);
    const text = cleanTelegramSourceText(rawDecoded);

    if (stats && hadPromoFooter && text) {
      stats.promoFootersRemoved += 1;
    }

    if (isPromotionalTelegramMessage(text)) {
      if (stats) {
        stats.promoOnlySkipped += 1;
      }
      continue;
    }

    if (!text || text.length < 15) {
      continue;
    }

    const [channelName, messageId] = dataPost.split("/");

    messages.push({
      sourceChannel: channel.name || channelName,
      sourceMessageId: messageId,
      sourceUrl: `https://t.me/${channelName}/${messageId}`,
      sourcePublishedAt: publishedAt,
      rawText: text,
      priority: channel.priority || 99,
      promoFooterRemoved: hadPromoFooter,
    });
  }

  return messages;
}

module.exports = {
  decodeTelegramHtml,
  cleanTelegramSourceText,
  parseTelegramChannelHtml,
  isPromotionalTelegramMessage,
};
