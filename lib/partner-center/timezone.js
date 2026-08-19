import { PARTNER_BUSINESS_TIMEZONE, PERIOD_TYPES } from "./phase2-constants.js";

export { PARTNER_BUSINESS_TIMEZONE };

function pad(n) {
  return String(n).padStart(2, "0");
}

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = fmt.format(date).split("-").map(Number);
  return { year, month, day };
}

function isoWeek({ year, month, day }) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function buildPeriodKey(periodType = PERIOD_TYPES.ONCE, at = new Date(), context = {}) {
  const type = String(periodType || "once").toLowerCase();
  if (type === "once" || !type) return "";

  if (type === "campaign_lifetime") {
    const campaignId = context.campaignProgramId || context.campaignId || context.campaign_program_id;
    if (!campaignId) return "campaign:unknown";
    return `campaign:${campaignId}`;
  }

  const parts = getZonedParts(at, PARTNER_BUSINESS_TIMEZONE);

  if (type === "daily") {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  if (type === "weekly") {
    return `${parts.year}-W${pad(isoWeek(parts))}`;
  }
  if (type === "monthly") {
    return `${parts.year}-${pad(parts.month)}`;
  }
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function isWithinWindow(startAt, endAt, at = new Date()) {
  const ts = at.getTime();
  if (startAt && ts < new Date(startAt).getTime()) return false;
  if (endAt && ts > new Date(endAt).getTime()) return false;
  return true;
}

/** Baghdad is fixed UTC+3 (no DST). */
function baghdadWallClockToUtcIso(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second, ms)).toISOString();
}

export function getPeriodBounds(periodType = PERIOD_TYPES.ONCE, at = new Date()) {
  const type = String(periodType || "once").toLowerCase();
  if (!type || type === "once" || type === "custom") {
    return { startAt: null, endAt: null };
  }

  const parts = getZonedParts(at, PARTNER_BUSINESS_TIMEZONE);

  if (type === "daily") {
    return {
      startAt: baghdadWallClockToUtcIso(parts.year, parts.month, parts.day, 0, 0, 0, 0),
      endAt: baghdadWallClockToUtcIso(parts.year, parts.month, parts.day, 23, 59, 59, 999),
    };
  }

  if (type === "monthly") {
    const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
    return {
      startAt: baghdadWallClockToUtcIso(parts.year, parts.month, 1, 0, 0, 0, 0),
      endAt: baghdadWallClockToUtcIso(parts.year, parts.month, daysInMonth, 23, 59, 59, 999),
    };
  }

  if (type === "weekly") {
    const week = isoWeek(parts);
    const jan4 = new Date(Date.UTC(parts.year, 0, 4));
    const weekStart = new Date(jan4);
    weekStart.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (week - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    return {
      startAt: baghdadWallClockToUtcIso(
        weekStart.getUTCFullYear(),
        weekStart.getUTCMonth() + 1,
        weekStart.getUTCDate(),
        0,
        0,
        0,
        0
      ),
      endAt: baghdadWallClockToUtcIso(
        weekEnd.getUTCFullYear(),
        weekEnd.getUTCMonth() + 1,
        weekEnd.getUTCDate(),
        23,
        59,
        59,
        999
      ),
    };
  }

  return { startAt: null, endAt: null };
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function minIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

export function intersectMetricWindows({ startAt, endAt } = {}, { startAt: bStart, endAt: bEnd } = {}) {
  const start = maxIso(startAt, bStart);
  const end = minIso(endAt, bEnd);
  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    return { startAt: null, endAt: null, empty: true };
  }
  return { startAt: start, endAt: end, empty: false };
}
