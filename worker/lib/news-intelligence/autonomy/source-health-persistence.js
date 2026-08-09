const { logAutonomyEvent } = require("./structured-log");
const { getSourceHealthEngine } = require("./source-health");

async function loadSourceHealthStates(supabase) {
  if (!supabase) return { loaded: 0, skipped: true };
  try {
    const { data, error } = await supabase.from("news_source_health_states").select("*");
    if (error) throw error;
    const engine = getSourceHealthEngine();
    for (const row of data || []) {
      engine.hydrateSourceHealth(row.source_type, row.source_id, {
        state: row.state,
        updatedAt: row.updated_at,
        evidence: row.evidence || {},
      });
    }
    return { loaded: (data || []).length };
  } catch (error) {
    logAutonomyEvent("NEWS_SOURCE_HEALTH_LOAD_FAILED", { error: error.message });
    return { loaded: 0, error: error.message };
  }
}

async function persistSourceHealthState(supabase, sourceType, sourceId) {
  if (!supabase) return { skipped: true };
  const health = getSourceHealthEngine().getSourceHealth(sourceType, sourceId);
  const row = {
    source_key: `${sourceType}:${sourceId}`,
    source_type: sourceType,
    source_id: sourceId,
    state: health.state,
    evidence: {
      parseSuccessRate: health.parseSuccessRate,
      sourceCausedConsecutive: health.sourceCausedConsecutive,
      stateReason: health.stateReason,
      minimumSamplesMet: health.minimumSamplesMet,
    },
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase.from("news_source_health_states").upsert(row, { onConflict: "source_key" });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    logAutonomyEvent("NEWS_SOURCE_HEALTH_PERSIST_FAILED", { error: error.message, sourceId });
    return { ok: false, error: error.message };
  }
}

async function flushSourceHealthStates(supabase) {
  if (!supabase) return { flushed: 0, skipped: true };
  const sources = getSourceHealthEngine().getAllSources();
  let flushed = 0;
  for (const source of sources) {
    const result = await persistSourceHealthState(supabase, source.sourceType, source.sourceId);
    if (result.ok) flushed += 1;
  }
  return { flushed };
}

module.exports = {
  loadSourceHealthStates,
  persistSourceHealthState,
  flushSourceHealthStates,
};
