const { logAutonomyEvent } = require("./structured-log");
const { openOrUpdateIncident, getOpenIncidents } = require("./incident-engine");

async function persistIncident(supabase, incident) {
  if (!supabase || !incident) return { skipped: true };
  const row = {
    incident_id: incident.incidentId,
    severity: incident.severity,
    incident_type: incident.incidentType,
    signature: incident.signature,
    started_at: incident.startedAt,
    last_seen_at: incident.lastSeenAt,
    affected_source: incident.affectedSource,
    affected_event_type: incident.affectedEventType,
    count: incident.count,
    evidence_summary: incident.evidenceSummary || {},
    current_state: incident.currentState,
    auto_action: incident.autoAction,
    resolved_at: incident.resolvedAt,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase
      .from("news_incidents")
      .upsert(row, { onConflict: "incident_id" });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    logAutonomyEvent("NEWS_INCIDENT_PERSIST_FAILED", { error: error.message, incidentId: incident.incidentId });
    return { ok: false, error: error.message };
  }
}

async function flushIncidents(supabase) {
  if (!supabase) return { flushed: 0, skipped: true };
  const incidents = getOpenIncidents();
  let flushed = 0;
  for (const incident of incidents) {
    const result = await persistIncident(supabase, incident);
    if (result.ok) flushed += 1;
  }
  return { flushed };
}

async function loadOpenIncidentsFromDb(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("news_incidents")
      .select("*")
      .eq("current_state", "open")
      .order("last_seen_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map((row) => ({
      incidentId: row.incident_id,
      severity: row.severity,
      incidentType: row.incident_type,
      signature: row.signature,
      startedAt: row.started_at,
      lastSeenAt: row.last_seen_at,
      affectedSource: row.affected_source,
      affectedEventType: row.affected_event_type,
      count: row.count,
      evidenceSummary: row.evidence_summary || {},
      currentState: row.current_state,
      autoAction: row.auto_action,
      resolvedAt: row.resolved_at,
    }));
  } catch (error) {
    logAutonomyEvent("NEWS_INCIDENT_LOAD_FAILED", { error: error.message });
    return [];
  }
}

module.exports = {
  persistIncident,
  flushIncidents,
  loadOpenIncidentsFromDb,
};
