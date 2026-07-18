import { createClient } from "@supabase/supabase-js";

const EMAIL_OUTBOX_TABLE = "email_outbox";
const DEFAULT_MAX_ATTEMPTS = 5;

function logOutboxEvent(level, event, meta = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    messageType: meta.messageType || null,
    idempotencyKey: meta.idempotencyKey || null,
    outboxId: meta.outboxId || null,
    error: meta.error || null,
    code: meta.code || null,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function createEmailOutboxAdminClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  if (anonKey && serviceRoleKey === anonKey) {
    throw new Error("Invalid Supabase service role key");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function normalizeRecipientEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function buildEmailIdempotencyKey(messageType, ...parts) {
  const normalizedType = String(messageType || "").trim();

  if (!normalizedType) {
    throw new Error("messageType is required to build an idempotency key");
  }

  const normalizedParts = parts
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .map((part) => String(part).trim());

  return [normalizedType, ...normalizedParts].join(":");
}

export function validateEmailOutboxPayload(payload = {}) {
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

  const normalizedEmail = normalizeRecipientEmail(payload.recipientEmail);

  if (payload.recipientEmail && !normalizedEmail.includes("@")) {
    errors.push("recipientEmail is invalid");
  }

  if (
    payload.metadata !== undefined &&
    (typeof payload.metadata !== "object" ||
      payload.metadata === null ||
      Array.isArray(payload.metadata))
  ) {
    errors.push("metadata must be a plain object");
  }

  if (payload.scheduledAt !== undefined && payload.scheduledAt !== null) {
    const scheduledDate = new Date(payload.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      errors.push("scheduledAt must be a valid date");
    }
  }

  if (payload.maxAttempts !== undefined && payload.maxAttempts !== null) {
    const maxAttempts = Number(payload.maxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
      errors.push("maxAttempts must be a positive number");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedEmail,
  };
}

function normalizeScheduledAt(scheduledAt) {
  if (scheduledAt === undefined || scheduledAt === null || scheduledAt === "") {
    return new Date().toISOString();
  }

  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error("scheduledAt must be a valid date");
  }

  return scheduledDate.toISOString();
}

function normalizeMaxAttempts(maxAttempts) {
  if (maxAttempts === undefined || maxAttempts === null || maxAttempts === "") {
    return DEFAULT_MAX_ATTEMPTS;
  }

  const normalized = Number(maxAttempts);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("maxAttempts must be a positive number");
  }

  return Math.floor(normalized);
}

function mapOutboxRecord(record) {
  if (!record) {
    return null;
  }

  return record;
}

function logEnqueueFailure(meta = {}) {
  logOutboxEvent("error", "email_outbox.enqueue_failed", {
    messageType: meta.messageType || null,
    idempotencyKey: meta.idempotencyKey || null,
    error: meta.error || "unknown error",
    code: meta.code || null,
  });
}

export async function enqueueEmail({
  idempotencyKey,
  recipientEmail,
  subject,
  html,
  text,
  messageType,
  metadata = {},
  scheduledAt,
  maxAttempts,
} = {}) {
  const validation = validateEmailOutboxPayload({
    idempotencyKey,
    recipientEmail,
    subject,
    messageType,
    metadata,
    scheduledAt,
    maxAttempts,
  });

  if (!validation.valid) {
    const error = new Error(
      `Invalid email outbox payload: ${validation.errors.join(", ")}`
    );
    error.code = "EMAIL_OUTBOX_VALIDATION_ERROR";
    error.validationErrors = validation.errors;
    throw error;
  }

  const supabase = createEmailOutboxAdminClient();
  const normalizedIdempotencyKey = String(idempotencyKey).trim();
  const row = {
    idempotency_key: normalizedIdempotencyKey,
    recipient_email: validation.normalizedEmail,
    subject: String(subject).trim(),
    html: html == null ? null : String(html),
    text: text == null ? null : String(text),
    message_type: String(messageType).trim(),
    metadata: metadata || {},
    scheduled_at: normalizeScheduledAt(scheduledAt),
    max_attempts: normalizeMaxAttempts(maxAttempts),
  };

  const { data, error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from(EMAIL_OUTBOX_TABLE)
        .select("*")
        .eq("idempotency_key", normalizedIdempotencyKey)
        .maybeSingle();

      if (fetchError) {
        logEnqueueFailure({
          messageType: row.message_type,
          idempotencyKey: normalizedIdempotencyKey,
          error: fetchError.message,
          code: fetchError.code,
        });

        const duplicateFetchError = new Error(
          "Duplicate idempotency key but failed to load existing record"
        );
        duplicateFetchError.code = "EMAIL_OUTBOX_DUPLICATE_FETCH_FAILED";
        throw duplicateFetchError;
      }

      logOutboxEvent("info", "email_outbox.duplicate", {
        messageType: row.message_type,
        idempotencyKey: normalizedIdempotencyKey,
        outboxId: existing?.id || null,
      });

      return {
        success: true,
        enqueued: false,
        duplicate: true,
        record: mapOutboxRecord(existing),
      };
    }

    logEnqueueFailure({
      messageType: row.message_type,
      idempotencyKey: normalizedIdempotencyKey,
      error: error.message,
      code: error.code,
    });

    const enqueueError = new Error("Failed to enqueue email");
    enqueueError.code = "EMAIL_OUTBOX_ENQUEUE_FAILED";
    throw enqueueError;
  }

  logOutboxEvent("info", "email_outbox.enqueued", {
    messageType: row.message_type,
    idempotencyKey: normalizedIdempotencyKey,
    outboxId: data?.id || null,
  });

  return {
    success: true,
    enqueued: true,
    duplicate: false,
    record: mapOutboxRecord(data),
  };
}
