#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  deriveOverallHealth,
  getNewsSystemStatusFromDb,
  buildDailyOperationalSummaryFromDb,
} from "../lib/news-system-status/read-model.js";

function createQueryBuilder(result) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    gte() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function createMockSupabase(config = {}) {
  const {
    sources = [],
    incidents = [],
    decisions = [],
    counts = {},
    lastPublished = [],
    publishedNews = [],
    funnelSnapshots = [],
    heartbeat = null,
    errors = {},
  } = config;

  const countDefaults = {
    published: 0,
    duplicate: 0,
    quality: 0,
    copy: 0,
    imageFailure: 0,
    economicRelease: 0,
    ...counts,
  };

  return {
    from(table) {
      if (errors[table]) {
        return createQueryBuilder({ data: null, error: errors[table] });
      }

      if (table === "news_source_health_states") {
        return createQueryBuilder({ data: sources, error: null });
      }

      if (table === "news_incidents") {
        return createQueryBuilder({ data: incidents, error: null });
      }

      if (table === "published_news") {
        let mode = "rows";
        const builder = {
          select(_cols, opts) {
            if (opts?.head) mode = "count";
            return builder;
          },
          gte() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            if (mode === "count") {
              return builder;
            }
            return Promise.resolve({ data: publishedNews.length ? publishedNews : lastPublished, error: null });
          },
          then(resolve, reject) {
            if (mode === "count") {
              return Promise.resolve({ count: countDefaults.published, data: null, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: publishedNews.length ? publishedNews : lastPublished, error: null }).then(
              resolve,
              reject
            );
          },
        };
        return builder;
      }

      if (table === "news_decision_records") {
        let mode = "decisions";
        const builder = {
          select(_cols, opts) {
            if (opts?.head) {
              mode = "count";
            } else if (_cols === "decision_at,event_type,source_type") {
              mode = "lastPublished";
            }
            return builder;
          },
          eq(field, value) {
            builder._eq = { field, value };
            return builder;
          },
          gte() {
            return builder;
          },
          order() {
            return builder;
          },
          limit(n) {
            if (mode === "decisions") {
              return Promise.resolve({ data: decisions, error: null });
            }
            if (mode === "lastPublished") {
              return Promise.resolve({ data: lastPublished, error: null });
            }
            return builder;
          },
          then(resolve, reject) {
            if (mode !== "count") {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            }
            const key = builder._eq?.field === "reason_code" ? builder._eq.value : builder._eq?.value;
            const countMap = {
              PUBLISHED: countDefaults.published,
              DUPLICATE_BLOCKED: countDefaults.duplicate,
              QUALITY_GATE_BLOCKED: countDefaults.quality,
              SOURCE_COPY_SIMILARITY_TOO_HIGH: countDefaults.copy,
              IMAGE_REQUIRED_UNAVAILABLE: countDefaults.imageFailure,
              US_INITIAL_JOBLESS_CLAIMS: countDefaults.economicRelease,
            };
            const count =
              builder._eq?.field === "event_type"
                ? countDefaults.economicRelease
                : countMap[key] ?? 0;
            return Promise.resolve({ count, data: null, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }

      if (table === "news_system_metric_snapshots") {
        let mode = "single";
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          gte() {
            return builder;
          },
          order() {
            return builder;
          },
          limit(n) {
            if (n === 1) {
              mode = "single";
              return builder;
            }
            mode = "many";
            return Promise.resolve({ data: funnelSnapshots, error: null });
          },
          maybeSingle() {
            return Promise.resolve({ data: heartbeat, error: null });
          },
          then(resolve, reject) {
            if (mode === "many") {
              return Promise.resolve({ data: funnelSnapshots, error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: heartbeat, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }

      return createQueryBuilder({ data: [], error: null });
    },
  };
}

// A. Full valid status payload
{
  const status = await getNewsSystemStatusFromDb(
    createMockSupabase({
      sources: [
        {
          source_type: "rss",
          source_id: "reuters",
          state: "HEALTHY",
          evidence: { parseSuccessRate: 0.95, sourceCausedConsecutive: 0 },
          updated_at: "2026-08-08T10:00:00.000Z",
        },
      ],
      incidents: [
        {
          incident_id: "inc-1",
          incident_type: "PARSE_FAILURE",
          severity: "HIGH",
          count: 2,
          affected_source: "reuters",
          affected_event_type: null,
          started_at: "2026-08-08T09:00:00.000Z",
          last_seen_at: "2026-08-08T09:30:00.000Z",
        },
      ],
      decisions: [
        {
          reason_code: "PUBLISHED",
          decision: "publish",
          latency: { totalMs: 1200 },
          source_id: "reuters",
          source_type: "rss",
          event_type: "GENERAL",
          decision_at: "2026-08-08T10:00:00.000Z",
          ai_used: true,
        },
      ],
      counts: { published: 3, duplicate: 1, quality: 0, copy: 0, imageFailure: 0, economicRelease: 1 },
      publishedNews: [{ published_at: "2026-08-08T10:00:00.000Z", title: "Real story", link: "https://example.com/a" }],
      funnelSnapshots: [
        {
          metrics: {
            funnel: { rssNew: 4, telegramNew: 2, editorialEvaluated: 3, publicationsSuccess: 1 },
          },
        },
      ],
      lastPublished: [{ published_at: "2026-08-08T10:00:00.000Z", title: "Real story", link: "https://example.com/a" }],
      heartbeat: {
        metrics: {
          heartbeat: {
            lastCycleCompletedAt: "2026-08-08T10:05:00.000Z",
            lastCycleDurationMs: 4500,
            runtimeFlags: {
              phase2: { phase2Editorial: true, phase2Ai: false, source: "worker_snapshot" },
              phase3: { phase3Autonomy: true, phase3AutoQuarantine: true, source: "worker_snapshot" },
            },
          },
        },
        bucket_start: "2026-08-08T10:05:00.000Z",
        created_at: "2026-08-08T10:05:00.000Z",
      },
    })
  );

  assert.equal(status.overallHealth, "DEGRADED");
  assert.equal(status.workerStatus, "active");
  assert.equal(status.sources.details.length, 1);
  assert.equal(status.openIncidents.length, 1);
  assert.equal(status.last24h.published, 3);
  assert.equal(status.last24h.observed, 6);
  assert.equal(status.last24h.evaluated, 3);
  assert.equal(status.last24h.averageLatencyMs, 1200);
  assert.equal(status.runtime.phase2.phase2Editorial, true);
  assert.equal(status.runtime.phase3.phase3Autonomy, true);
  assert.ok(status.heartbeat.lastCycleCompletedAt);
}

// B. No worker heartbeat snapshot
{
  const status = await getNewsSystemStatusFromDb(createMockSupabase({ heartbeat: null }));
  assert.equal(status.workerStatus, "db_backed");
  assert.equal(status.lastSuccessfulCycleAt, null);
  assert.equal(status.runtime.phase2.source, "worker_snapshot_unavailable");
  assert.equal(status.runtime.phase3.source, "worker_snapshot_unavailable");
}

// C. Empty incidents
{
  const status = await getNewsSystemStatusFromDb(createMockSupabase({ incidents: [] }));
  assert.deepEqual(status.openIncidents, []);
  assert.equal(status.metrics.incidents_open, 0);
}

// D. Empty source health
{
  const status = await getNewsSystemStatusFromDb(createMockSupabase({ sources: [] }));
  assert.deepEqual(status.sources.details, []);
  assert.equal(status.overallHealth, "HEALTHY");
}

// E. Null/partial metrics
{
  const status = await getNewsSystemStatusFromDb(
    createMockSupabase({
      decisions: [{ reason_code: "PUBLISHED", latency: null, ai_used: null, decision_at: "2026-08-08T10:00:00.000Z" }],
    })
  );
  assert.equal(status.last24h.averageLatencyMs, null);
  assert.equal(status.last24h.p95LatencyMs, null);
  assert.equal(status.aiUsage.calls, 0);
}

// F. API DB/read-model failure
{
  await assert.rejects(
    () =>
      getNewsSystemStatusFromDb(
        createMockSupabase({
          errors: { news_source_health_states: { message: "connection failed", code: "500" } },
        })
      ),
    (error) => error?.message === "connection failed"
  );
}

// Summary contract
{
  const summary = await buildDailyOperationalSummaryFromDb(createMockSupabase());
  assert.equal(summary.dataSource, "persisted_telemetry");
  assert.ok(summary.generatedAt);
  assert.ok(summary.runtime);
  assert.ok(summary.sourceHealth);
}

assert.equal(deriveOverallHealth({ openIncidents: [], sources: [] }), "HEALTHY");

console.log("test-news-system-status-read-model.js: PASS");
