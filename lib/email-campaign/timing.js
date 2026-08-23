/** Safe structured timing logs for campaign operations (no PII). */
export function createCampaignTiming(operation) {
  const startedAt = Date.now();
  const marks = {};

  return {
    mark(label) {
      marks[label] = Date.now() - startedAt;
    },
    finish(extra = {}) {
      const totalMs = Date.now() - startedAt;
      const payload = {
        operation,
        totalMs,
        ...marks,
        ...extra,
      };
      console.info("[email-campaign-timing]", JSON.stringify(payload));
      return payload;
    },
  };
}
