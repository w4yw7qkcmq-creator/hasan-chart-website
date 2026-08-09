function parseMessageId(value) {
  const raw = String(value || "").split(":")[0];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  parseMessageId,
};
