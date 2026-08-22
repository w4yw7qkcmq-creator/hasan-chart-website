/**
 * Re-export VIP outbox sync from canonical outbox core.
 * @deprecated Import from lib/email-outbox-processor.js instead.
 */
export {
  syncVipStatusDeliveryFromOutbox,
  VIP_STATUS_EMAIL_MESSAGE_TYPE,
} from "./email-outbox-processor.js";
