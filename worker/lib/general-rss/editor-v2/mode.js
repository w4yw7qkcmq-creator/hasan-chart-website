const EDITOR_V2_MODES = Object.freeze({
  OFF: "OFF",
  SHADOW: "SHADOW",
  LIVE: "LIVE",
});

const V2_OUTPUT_PATHS = Object.freeze({
  AI_DIRECT: "AI_DIRECT",
  DETERMINISTIC_FALLBACK: "DETERMINISTIC_FALLBACK",
  FAILED: "FAILED",
});

function resolveEditorV2Mode(env = process.env) {
  const raw = String(env?.EDITOR_V2_MODE || "SHADOW")
    .trim()
    .toUpperCase();
  if (raw === EDITOR_V2_MODES.OFF || raw === EDITOR_V2_MODES.LIVE || raw === EDITOR_V2_MODES.SHADOW) {
    return raw;
  }
  return EDITOR_V2_MODES.SHADOW;
}

function isEditorV2Off(env = process.env) {
  return resolveEditorV2Mode(env) === EDITOR_V2_MODES.OFF;
}

function isEditorV2ShadowMode(env = process.env) {
  return resolveEditorV2Mode(env) === EDITOR_V2_MODES.SHADOW;
}

function isEditorV2LiveMode(env = process.env) {
  return resolveEditorV2Mode(env) === EDITOR_V2_MODES.LIVE;
}

function isEditorV2Enabled(env = process.env) {
  return !isEditorV2Off(env);
}

module.exports = {
  EDITOR_V2_MODES,
  V2_OUTPUT_PATHS,
  resolveEditorV2Mode,
  isEditorV2Off,
  isEditorV2ShadowMode,
  isEditorV2LiveMode,
  isEditorV2Enabled,
};
