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
