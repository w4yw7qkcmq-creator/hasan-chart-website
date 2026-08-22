import { sendEmail } from "./email.js";
import { enqueueEmail } from "./email-outbox-shared.js";
import { resolveEmailCategoryFromMetadata } from "./email-categories.js";
import {
  assertBulkEmailQueueEnabled,
  createBulkQueueRequiredError,
} from "./email-dispatch-policy.js";

export function isEmailQueueWorkerEnabled() {
  const value = String(process.env.EMAIL_QUEUE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function extractRecipientDomain(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

function logEmailDispatchEvent(event, meta = {}) {
  const payload = {
    level: meta.level || "info",
    event,
    timestamp: new Date().toISOString(),
    messageType: meta.messageType || null,
    idempotencyKey: meta.idempotencyKey || null,
    recipientDomain: extractRecipientDomain(meta.recipientEmail),
    mode: meta.mode || null,
    recordId: meta.recordId || null,
    outboxId: meta.outboxId || null,
    error: meta.error || null,
  };

  const line = JSON.stringify(payload);

  if (payload.level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function validateDispatchPayload(payload = {}) {
  const errors = [];

  if (!String(payload.idempotencyKey || "").trim()) {
    errors.push("idempotencyKey is required");
  }

  if (!String(payload.recipientEmail || "").trim()) {
    errors.push("recipientEmail is required");
  }

  if (!String(payload.subject || "").trim()) {
    errors.push("subject is required");
  }

  if (!String(payload.messageType || "").trim()) {
    errors.push("messageType is required");
  }

  if (!String(payload.html || "").trim()) {
    errors.push("html is required");
  }

  if (
    payload.metadata !== undefined &&
    (typeof payload.metadata !== "object" ||
      payload.metadata === null ||
      Array.isArray(payload.metadata))
  ) {
    errors.push("metadata must be a plain object");
  }

  return errors;
}

export async function dispatchTransactionalEmail(
  {
    idempotencyKey,
    recipientEmail,
    subject,
    html,
    text,
    messageType,
    metadata = {},
    recordId,
  },
  deps = {}
) {
  const validationErrors = validateDispatchPayload({
    idempotencyKey,
    recipientEmail,
    subject,
    html,
    messageType,
    metadata,
  });

  if (validationErrors.length > 0) {
    const error = new Error(
      `Invalid transactional email dispatch payload: ${validationErrors.join(", ")}`
    );
    error.code = "EMAIL_DISPATCH_VALIDATION_ERROR";
    error.validationErrors = validationErrors;
    throw error;
  }

  const enqueueFn = deps.enqueueEmail || enqueueEmail;
  const sendDirectFn = deps.sendDirectEmail || sendEmail;
  const normalizedIdempotencyKey = String(idempotencyKey).trim();
  const emailCategory = resolveEmailCategoryFromMetadata(metadata);
  const bulkQueueCheck = assertBulkEmailQueueEnabled(emailCategory);

  if (!bulkQueueCheck.ok) {
    throw createBulkQueueRequiredError();
  }

  const logMeta = {
    messageType: String(messageType).trim(),
    idempotencyKey: normalizedIdempotencyKey,
    recipientEmail,
    recordId: recordId || null,
  };

  if (isEmailQueueWorkerEnabled()) {
    logEmailDispatchEvent("EMAIL_DISPATCH_STARTED", {
      ...logMeta,
      mode: "outbox",
      emailCategory,
    });

    try {
      const result = await enqueueFn({
        idempotencyKey: normalizedIdempotencyKey,
        recipientEmail,
        subject,
        html,
        text,
        messageType: logMeta.messageType,
        metadata,
      });

      if (result.duplicate) {
        logEmailDispatchEvent("EMAIL_OUTBOX_DUPLICATE", {
          ...logMeta,
          mode: "outbox",
          outboxId: result.record?.id || null,
        });
      } else if (result.enqueued) {
        logEmailDispatchEvent("EMAIL_OUTBOX_ENQUEUED", {
          ...logMeta,
          mode: "outbox",
          outboxId: result.record?.id || null,
        });
      }

      return {
        success: true,
        mode: "outbox",
        enqueued: result.enqueued,
        duplicate: result.duplicate,
        record: result.record || null,
      };
    } catch (error) {
      logEmailDispatchEvent("EMAIL_DISPATCH_FAILED", {
        ...logMeta,
        mode: "outbox",
        level: "error",
        error: error?.message || "enqueue failed",
      });

      return {
        success: false,
        mode: "outbox",
        enqueued: false,
        duplicate: false,
        error: error?.message || "enqueue failed",
      };
    }
  }

  logEmailDispatchEvent("EMAIL_DISPATCH_STARTED", {
    ...logMeta,
    mode: "direct",
    emailCategory,
  });

  const directResult = await sendDirectFn({
    to: recipientEmail,
    subject,
    html,
    text,
  });

  logEmailDispatchEvent("EMAIL_DISPATCH_DIRECT", {
    ...logMeta,
    mode: "direct",
  });

  if (directResult?.success === false) {
    logEmailDispatchEvent("EMAIL_DISPATCH_FAILED", {
      ...logMeta,
      mode: "direct",
      level: "error",
      error: directResult?.error || "direct send failed",
    });
  }

  return {
    success: directResult?.success !== false,
    mode: "direct",
    ...directResult,
  };
}
