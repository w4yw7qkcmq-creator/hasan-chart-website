import { redactLogMeta } from "./log-redaction";

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CURRENT_LEVEL =
  LOG_LEVELS[process.env.PARTNER_LOG_LEVEL] ?? LOG_LEVELS.info;

function writeLog(level, event, payload = {}) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) {
    return;
  }

  const entry = redactLogMeta({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error("[PARTNER]", line);
    return;
  }

  if (level === "warn") {
    console.warn("[PARTNER]", line);
    return;
  }

  console.info("[PARTNER]", line);
}

export const partnerLogger = {
  debug(event, payload) {
    writeLog("debug", event, payload);
  },
  info(event, payload) {
    writeLog("info", event, payload);
  },
  warn(event, payload) {
    writeLog("warn", event, payload);
  },
  error(event, payload) {
    writeLog("error", event, payload?.error ? { ...payload, message: payload.error?.message } : payload);
  },
  commission(action, payload) {
    writeLog("info", `commission.${action}`, payload);
  },
  withdrawal(action, payload) {
    writeLog("info", `withdrawal.${action}`, payload);
  },
  upgrade(action, payload) {
    writeLog("info", `upgrade.${action}`, payload);
  },
  bonus(action, payload) {
    writeLog("info", `bonus.${action}`, payload);
  },
  achievement(action, payload) {
    writeLog("info", `achievement.${action}`, payload);
  },
};
