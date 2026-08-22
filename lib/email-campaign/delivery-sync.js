import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const deliverySync = require("./delivery-sync.cjs");

export const {
  shouldApplyDeliveryStatus,
  mapWebhookEventToDeliveryStatus,
  syncCampaignRecipientFromOutbox,
  syncCampaignRecipientFromWebhook,
  refreshCampaignMetricsFromRecipients,
  maybeMarkCampaignEnqueueCompleted,
} = deliverySync;
