import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("./email-outbox-core.cjs");

export const buildProviderIdempotencyKey = core.buildProviderIdempotencyKey;
export const buildOutboxResendTags = core.buildOutboxResendTags;
export const isEmailQueueWorkerEnabled = core.isEmailQueueWorkerEnabled;
export const getEmailQueueConfig = core.getEmailQueueConfig;
export const extractRecipientDomain = core.extractRecipientDomain;
export const logEmailQueueEvent = core.logEmailQueueEvent;
export const calculateRetryDelay = core.calculateRetryDelay;
export const sendOutboxEmailViaResend = core.sendOutboxEmailViaResend;
export const claimPendingEmailBatch = core.claimPendingEmailBatch;
export const releaseStaleProcessingEmails = core.releaseStaleProcessingEmails;
export const persistProviderIdempotencyKey = core.persistProviderIdempotencyKey;
export const markEmailAccepted = core.markEmailAccepted;
export const markEmailSent = core.markEmailSent;
export const markEmailFailed = core.markEmailFailed;
export const markEmailRetryScheduled = core.markEmailRetryScheduled;
export const markEmailSkipped = core.markEmailSkipped;
export const markEmailUncertain = core.markEmailUncertain;
export const upsertEmailMessageFromOutbox = core.upsertEmailMessageFromOutbox;
export const syncVipStatusDeliveryFromOutbox = core.syncVipStatusDeliveryFromOutbox;
export const finalizeProviderAccepted = core.finalizeProviderAccepted;
export const processSingleOutboxEmail = core.processSingleOutboxEmail;
export const processEmailOutboxBatch = core.processEmailOutboxBatch;
export const runEmailQueueCron = core.runEmailQueueCron;
export const VIP_STATUS_EMAIL_MESSAGE_TYPE = core.VIP_STATUS_EMAIL_MESSAGE_TYPE;
