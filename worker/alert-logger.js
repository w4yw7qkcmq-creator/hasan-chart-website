const { redactLogMeta } = require("./log-redaction");

function logWorkerEvent(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify(
    redactLogMeta({
      ...payload,
      ts: new Date().toISOString(),
    })
  )}`;

  const isError =
    tag.includes("FAILED") ||
    tag.includes("ERROR") ||
    payload?.success === false;

  if (isError) {
    console.error(line);
    return;
  }

  console.log(line);
}

module.exports = {
  logWorkerEvent,
};
