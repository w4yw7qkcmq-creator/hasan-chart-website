const PIPELINE_STAGES = Object.freeze([
  "SOURCE_RECEIVED",
  "SANITIZED",
  "EVENT_DETECTED",
  "EVENT_CLASSIFIED",
  "COVERAGE_ALLOWED",
  "STRUCTURED_DATA_VALID",
  "REGISTRY_MATCHED",
  "DEDUP_PASSED",
  "QUALITY_GATE_PASSED",
  "PUBLISHED",
]);

function createPipelineTrace(initialStage = "SOURCE_RECEIVED", metadata = {}) {
  return {
    stages: [initialStage],
    metadata: { ...metadata },
    terminalReason: null,
  };
}

function appendPipelineStage(trace, stage, metadata = {}) {
  if (!trace) {
    return createPipelineTrace(stage, metadata);
  }
  if (trace.stages[trace.stages.length - 1] !== stage) {
    trace.stages.push(stage);
  }
  trace.metadata = { ...trace.metadata, ...metadata };
  return trace;
}

function finalizePipelineTrace(trace, terminalReason = null) {
  if (!trace) {
    return null;
  }
  trace.terminalReason = terminalReason;
  return trace;
}

function buildPipelineTraceMetadata(trace) {
  if (!trace) {
    return null;
  }
  return {
    pipelineStages: trace.stages,
    pipelineTerminalReason: trace.terminalReason,
    ...trace.metadata,
  };
}

module.exports = {
  PIPELINE_STAGES,
  createPipelineTrace,
  appendPipelineStage,
  finalizePipelineTrace,
  buildPipelineTraceMetadata,
};
