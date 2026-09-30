const { logAutonomyEvent } = require("./structured-log");
const { getSourceHealthEngine } = require("./source-health");

const SOURCE_HEALTH_PERSIST_INTERVAL_MS = 60 * 1000;
const lastPersistedSourceHealth = new Map();

function sourceHealthKey(source) {
  return `${source.sourceType}:${source.sourceId}`;
}

function sourceHealthNeedsPersist(source, now, intervalMs = SOURCE_HEALTH_PERSIST_INTERVAL_MS) {
  const previous = lastPersistedSourceHealth.get(sourceHealthKey(source));
  if (!previous) return true;
  if (previous.state !== source.state) return true;
  return now - previous.at >= intervalMs;
}

function buildSourceHealthRow(health, updatedAt = new Date().toISOString()) {
  return {
    source_key: sourceHealthKey(health),
    source_type: health.sourceType,
    source_id: health.sourceId,
    state: health.state,
    evidence: {
      parseSuccessRate: health.parseSuccessRate,
      sourceCausedConsecutive: health.sourceCausedConsecutive,
      stateReason: health.stateReason,
      minimumSamplesMet: health.minimumSamplesMet,
    },
    updated_at: updatedAt,
  };
}

function rememberPersistedSourceHealth(sources, now) {
  for (const source of sources) {
    lastPersistedSourceHealth.set(sourceHealthKey(source), { state: source.state, at: now });
  }
}

function resetSourceHealthPersistMemoryForTests() {
  lastPersistedSourceHealth.clear();
}

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
  const row = buildSourceHealthRow(health);
  try {
    const { error } = await supabase.from("news_source_health_states").upsert(row, { onConflict: "source_key" });
    if (error) throw error;
    rememberPersistedSourceHealth([health], Date.now());
    return { ok: true, requests: 1 };
  } catch (error) {
    logAutonomyEvent("NEWS_SOURCE_HEALTH_PERSIST_FAILED", { error: error.message, sourceId });
    return { ok: false, error: error.message };
  }
}

async function flushSourceHealthStates(supabase, options = {}) {
  if (!supabase) return { flushed: 0, skipped: true, requests: 0 };
  const now = options.now || Date.now();
  const intervalMs = options.intervalMs || SOURCE_HEALTH_PERSIST_INTERVAL_MS;
  const sources = getSourceHealthEngine().getAllSources();
  const due = sources.filter((source) => sourceHealthNeedsPersist(source, now, intervalMs));
  if (!due.length) {
    return { flushed: 0, throttled: sources.length, requests: 0 };
  }

  const updatedAt = new Date(now).toISOString();
  const rows = due.map((source) => buildSourceHealthRow(source, updatedAt));
  try {
    const { error } = await supabase.from("news_source_health_states").upsert(rows, { onConflict: "source_key" });
    if (error) throw error;
    rememberPersistedSourceHealth(due, now);
    return { flushed: rows.length, requests: 1 };
  } catch (error) {
    logAutonomyEvent("NEWS_SOURCE_HEALTH_PERSIST_FAILED", { error: error.message, batchSize: rows.length });
    return { flushed: 0, error: error.message, requests: 1 };
  }
}

module.exports = {
  SOURCE_HEALTH_PERSIST_INTERVAL_MS,
  loadSourceHealthStates,
  persistSourceHealthState,
  flushSourceHealthStates,
  sourceHealthNeedsPersist,
  resetSourceHealthPersistMemoryForTests,
};
