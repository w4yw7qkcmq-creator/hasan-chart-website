const crypto = require("crypto");

function createCorrelationId(prefix = "news") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function hashSourceRef(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function sanitizeLogPayload(payload = {}) {
  const safe = { ...payload };
  delete safe.rawSourceText;
  delete safe.rawText;
  delete safe.body;
  delete safe.message;
  delete safe.content;
  delete safe.token;
  delete safe.secret;
  delete safe.apiKey;
  return safe;
}

function logAutonomyEvent(event, payload = {}) {
  const safe = sanitizeLogPayload(payload);
  console.log(event, JSON.stringify({ event, ...safe }));
}

module.exports = {
  createCorrelationId,
  hashSourceRef,
  sanitizeLogPayload,
  logAutonomyEvent,
};
