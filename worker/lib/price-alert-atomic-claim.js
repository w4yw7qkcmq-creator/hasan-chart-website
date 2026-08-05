async function claimActivePriceAlert(supabase, { alertId, triggeredPrice, runId = null }) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) {
    return { claimed: false, reason: "missing_alert_id" };
  }

  const updatePayload = {
    status: "triggered",
    triggered_at: new Date().toISOString(),
    triggered_price: String(triggeredPrice),
  };

  const { data, error } = await supabase
    .from("price_alerts")
    .update(updatePayload)
    .eq("id", normalizedAlertId)
    .eq("status", "active")
    .select("id, status, triggered_at, triggered_price")
    .maybeSingle();

  if (error) {
    return { claimed: false, reason: error.message, error };
  }

  if (!data?.id) {
    return { claimed: false, reason: "already_claimed_or_inactive", duplicate: true };
  }

  return {
    claimed: true,
    alert: data,
    runId: runId || null,
  };
}

module.exports = {
  claimActivePriceAlert,
};
