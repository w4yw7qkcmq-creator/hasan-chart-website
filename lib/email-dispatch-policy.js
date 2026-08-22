import { isEmailQueueWorkerEnabled } from "./email-outbox-processor.js";
import { isBulkEmailCategory } from "./email-categories.js";

export const BULK_EMAIL_REQUIRES_OUTBOX_ERROR =
  "BULK_EMAIL_REQUIRES_OUTBOX";

export function assertBulkEmailQueueEnabled(category, env = process.env) {
  if (!isBulkEmailCategory(category)) {
    return { ok: true };
  }

  if (isEmailQueueWorkerEnabled(env)) {
    return { ok: true };
  }

  return {
    ok: false,
    code: BULK_EMAIL_REQUIRES_OUTBOX_ERROR,
    error:
      "Bulk and marketing email must use the durable email outbox; direct send is not permitted.",
  };
}

export function createBulkQueueRequiredError() {
  const error = new Error(
    "Bulk and marketing email must be enqueued via email_outbox; EMAIL_QUEUE_WORKER_ENABLED is required."
  );
  error.code = BULK_EMAIL_REQUIRES_OUTBOX_ERROR;
  return error;
}
