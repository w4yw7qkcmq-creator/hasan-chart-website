export async function recordTelegramWebhookIngress(supabase, {
  updateId,
  channelId = null,
  messageId = null,
  updateType,
  processingResult,
  errorCode = null,
}) {
  const { error } = await supabase.from("telegram_webhook_ingress_log").insert({
    telegram_update_id: updateId,
    telegram_channel_id: channelId,
    telegram_message_id: messageId,
    update_type: updateType,
    processing_result: processingResult,
    error_code: errorCode,
  });

  if (!error) {
    return { inserted: true, duplicate: false };
  }

  if (error.code === "23505") {
    return { inserted: false, duplicate: true };
  }

  throw error;
}

export async function runOperationalCleanup(supabase, {
  ingressRetentionDays,
  bufferTerminalRetentionDays,
} = {}) {
  const { data, error } = await supabase.rpc("cleanup_telegram_content_operational_tables", {
    p_ingress_retention_days: ingressRetentionDays,
    p_buffer_terminal_retention_days: bufferTerminalRetentionDays,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || {} : data || {};
}
