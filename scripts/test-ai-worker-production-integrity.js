#!/usr/bin/env node
import assert from "node:assert/strict";

const VALID_STATUSES = new Set([
  "reserving",
  "processing",
  "completed",
  "failed",
  "released",
]);

function classifyRequest(row, jobsByJobId) {
  const job = row.job_id ? jobsByJobId.get(row.job_id) : null;
  if (!row.status || !VALID_STATUSES.has(row.status)) return "INVALID";
  if (row.status === "completed") {
    if (!row.job_id) return "ORPHAN_REQUEST";
    if (!row.completed_at) return "STUCK";
    if (!row.analysis_result && !(job && job.analysis_result)) return "MISSING_RESULT";
    return "VALID_COMPLETED";
  }
  if (row.status === "failed") {
    if (!row.job_id) return "ORPHAN_REQUEST";
    return "VALID_FAILED";
  }
  if (row.status === "processing") {
    if (!row.job_id) return "ORPHAN_REQUEST";
    if (!job) return "ORPHAN_JOB";
    if (["queued", "claimed", "processing"].includes(job.status)) return "PROCESSING";
    return "STUCK";
  }
  if (row.status === "reserving") return "QUEUED";
  if (row.status === "released") return "VALID_FAILED";
  return "UNKNOWN";
}

function audit(requests, jobs) {
  const jobsByJobId = new Map(jobs.map((j) => [j.job_id, j]));
  const counts = {};
  for (const row of requests) {
    const bucket = classifyRequest(row, jobsByJobId);
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return counts;
}

const sampleProduction = {
  requests: [
    { id: "1", status: "completed", job_id: "job_a", completed_at: "t", analysis_result: null },
    { id: "2", status: "completed", job_id: "job_b", completed_at: "t", analysis_result: null },
    { id: "3", status: "completed", job_id: "job_c", completed_at: "t", analysis_result: null },
    { id: "4", status: "completed", job_id: "job_d", completed_at: "t", analysis_result: null },
  ],
  jobs: [],
};

const counts = audit(sampleProduction.requests, sampleProduction.jobs);
assert.equal(counts.UNKNOWN || 0, 0);
assert.equal(counts.MISSING_RESULT, 4);
assert.equal(counts.VALID_COMPLETED || 0, 0);

console.log("test-ai-worker-production-integrity: PASS", counts);
