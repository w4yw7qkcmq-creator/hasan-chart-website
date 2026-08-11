export const ADMIN_USER_TIMEZONE = "Asia/Damascus";

export const REGISTRATION_COHORTS = Object.freeze({
  today: "today",
  week: "week",
  month: "month",
});

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getZonedDateParts(date, timeZone = ADMIN_USER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  return { year, month, day };
}

function getZonedDateTimeParts(date, timeZone = ADMIN_USER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function compareZonedDateTime(left, right) {
  for (const key of ["year", "month", "day", "hour", "minute", "second"]) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

export function zonedLocalDateTimeToUtcIso(
  { year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 },
  timeZone = ADMIN_USER_TIMEZONE
) {
  const target = { year, month, day, hour, minute, second };
  let guess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const zoned = getZonedDateTimeParts(new Date(guess), timeZone);
    const cmp = compareZonedDateTime(zoned, target);
    if (cmp === 0) {
      return new Date(guess).toISOString();
    }

    const zonedMs = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += targetMs - zonedMs;
  }

  return new Date(guess).toISOString();
}

function ymdKey({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function startOfIsoWeek(parts) {
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = anchor.getUTCDay() || 7;
  return addDays(parts, 1 - dayNum);
}

function endOfMonth(parts) {
  return {
    year: parts.year,
    month: parts.month,
    day: new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate(),
  };
}

export function getRegistrationCohortRange(cohort, at = new Date(), timeZone = ADMIN_USER_TIMEZONE) {
  const normalized = String(cohort || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;

  const today = getZonedDateParts(at, timeZone);

  if (normalized === REGISTRATION_COHORTS.today) {
    const startIso = zonedLocalDateTimeToUtcIso({ ...today, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
    const endIso = zonedLocalDateTimeToUtcIso(
      { ...today, hour: 23, minute: 59, second: 59, millisecond: 999 },
      timeZone
    );
    return {
      cohort: normalized,
      label: "اليوم",
      startIso,
      endIso,
      dateFrom: ymdKey(today),
      dateTo: ymdKey(today),
    };
  }

  if (normalized === REGISTRATION_COHORTS.week) {
    const weekStart = startOfIsoWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const startIso = zonedLocalDateTimeToUtcIso(
      { ...weekStart, hour: 0, minute: 0, second: 0, millisecond: 0 },
      timeZone
    );
    const endIso = zonedLocalDateTimeToUtcIso(
      { ...weekEnd, hour: 23, minute: 59, second: 59, millisecond: 999 },
      timeZone
    );
    return {
      cohort: normalized,
      label: "هذا الأسبوع",
      startIso,
      endIso,
      dateFrom: ymdKey(weekStart),
      dateTo: ymdKey(weekEnd),
    };
  }

  if (normalized === REGISTRATION_COHORTS.month) {
    const monthStart = { year: today.year, month: today.month, day: 1 };
    const monthEnd = endOfMonth(today);
    const startIso = zonedLocalDateTimeToUtcIso(
      { ...monthStart, hour: 0, minute: 0, second: 0, millisecond: 0 },
      timeZone
    );
    const endIso = zonedLocalDateTimeToUtcIso(
      { ...monthEnd, hour: 23, minute: 59, second: 59, millisecond: 999 },
      timeZone
    );
    return {
      cohort: normalized,
      label: "هذا الشهر",
      startIso,
      endIso,
      dateFrom: ymdKey(monthStart),
      dateTo: ymdKey(monthEnd),
    };
  }

  return null;
}

export function isCreatedAtWithinRange(createdAt, startIso, endIso) {
  if (!createdAt || !startIso || !endIso) return false;
  const ts = new Date(createdAt).getTime();
  return ts >= new Date(startIso).getTime() && ts <= new Date(endIso).getTime();
}

export function resolveRegistrationDateBounds({
  cohort = "",
  registeredFrom = "",
  registeredTo = "",
  at = new Date(),
  timeZone = ADMIN_USER_TIMEZONE,
} = {}) {
  const cohortRange = getRegistrationCohortRange(cohort, at, timeZone);
  if (cohortRange) {
    return {
      registeredFromIso: cohortRange.startIso,
      registeredToIso: cohortRange.endIso,
      registeredFromDate: cohortRange.dateFrom,
      registeredToDate: cohortRange.dateTo,
      cohort: cohortRange.cohort,
      cohortLabel: cohortRange.label,
    };
  }

  const fromDate = String(registeredFrom || "").trim();
  const toDate = String(registeredTo || "").trim();

  return {
    registeredFromIso: fromDate
      ? zonedLocalDateTimeToUtcIso(
          {
            ...parseYmd(fromDate),
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
          },
          timeZone
        )
      : "",
    registeredToIso: toDate
      ? zonedLocalDateTimeToUtcIso(
          {
            ...parseYmd(toDate),
            hour: 23,
            minute: 59,
            second: 59,
            millisecond: 999,
          },
          timeZone
        )
      : "",
    registeredFromDate: fromDate,
    registeredToDate: toDate,
    cohort: "",
    cohortLabel: "",
  };
}

export function resolveLastLoginDateBounds({
  lastLoginFrom = "",
  lastLoginTo = "",
  timeZone = ADMIN_USER_TIMEZONE,
} = {}) {
  const fromDate = String(lastLoginFrom || "").trim();
  const toDate = String(lastLoginTo || "").trim();

  return {
    lastLoginFromIso: fromDate
      ? zonedLocalDateTimeToUtcIso(
          {
            ...parseYmd(fromDate),
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
          },
          timeZone
        )
      : "",
    lastLoginToIso: toDate
      ? zonedLocalDateTimeToUtcIso(
          {
            ...parseYmd(toDate),
            hour: 23,
            minute: 59,
            second: 59,
            millisecond: 999,
          },
          timeZone
        )
      : "",
    lastLoginFromDate: fromDate,
    lastLoginToDate: toDate,
  };
}

function parseYmd(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return { year, month, day };
}
