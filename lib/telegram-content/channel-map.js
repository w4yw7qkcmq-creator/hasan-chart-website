import { TELEGRAM_CONTENT_SECTIONS } from "./constants.js";

const SECTION_SHORT = Object.freeze({
  daily_analysis: "da",
  academy: "ac",
  result: "rs",
});

export function parseTelegramChannelId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function buildChannelToSectionMap(env = process.env) {
  const entries = [
    ["daily_analysis", env.TELEGRAM_CONTENT_CHANNEL_DAILY_ANALYSIS],
    ["academy", env.TELEGRAM_CONTENT_CHANNEL_ACADEMY],
    ["result", env.TELEGRAM_CONTENT_CHANNEL_RESULT],
  ];

  const map = new Map();

  for (const [section, rawChannelId] of entries) {
    const channelId = parseTelegramChannelId(rawChannelId);
    if (channelId !== null) {
      map.set(channelId.toString(), section);
    }
  }

  return map;
}

let cachedMap = null;

export function getChannelToSectionMap(env = process.env) {
  if (env !== process.env) {
    return buildChannelToSectionMap(env);
  }
  if (!cachedMap) {
    cachedMap = buildChannelToSectionMap();
  }
  return cachedMap;
}

export function resetChannelToSectionMapCache() {
  cachedMap = null;
}

export function resolveSectionForChannelId(channelId, env = process.env) {
  if (channelId === null || channelId === undefined) return null;
  const key = BigInt(channelId).toString();
  return getChannelToSectionMap(env).get(key) || null;
}

export function isKnownTelegramContentSection(section) {
  return TELEGRAM_CONTENT_SECTIONS.includes(String(section || "").trim());
}

export function buildTelegramContentPublicSlug(section, canonicalMessageId) {
  const prefix = SECTION_SHORT[section] || "tg";
  return `tg-${prefix}-${String(canonicalMessageId)}`;
}

export function buildTelegramContentDisplayTitle(body) {
  const text = String(body || "").trim();
  if (!text) return "Telegram Post";
  const firstLine = text.split(/\r?\n/)[0]?.trim() || text;
  return firstLine.slice(0, 200);
}
