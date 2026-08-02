const { FORBIDDEN_PROMPT_TERMS } = require("./config/visual-rules");
const { PEOPLE } = require("./config/people");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePromptSpec(spec = {}, profile = {}, entities = {}) {
  const issues = [];
  const prompt = String(spec.prompt || "");

  for (const term of FORBIDDEN_PROMPT_TERMS) {
    if (new RegExp(escapeRegExp(term), "i").test(prompt)) {
      issues.push(`forbidden_term:${term}`);
    }
  }

  if (/\b\d+(?:\.\d+)?%/.test(prompt)) {
    issues.push("contains_percentage_number");
  }

  if (/previous|forecast|actual/i.test(prompt)) {
    issues.push("contains_result_labels");
  }

  if (profile.previous && String(profile.previous).trim() && prompt.includes(String(profile.previous).trim())) {
    issues.push("leaked_previous_value");
  }
  if (profile.forecast && String(profile.forecast).trim() && prompt.includes(String(profile.forecast).trim())) {
    issues.push("leaked_forecast_value");
  }
  if (profile.actual && String(profile.actual).trim() && prompt.includes(String(profile.actual).trim())) {
    issues.push("leaked_actual_value");
  }

  if (!/absolutely no text|no text/i.test(prompt) || !/no logos/i.test(prompt)) {
    issues.push("missing_no_text_or_logos_directive");
  }

  const scenePart = String(prompt).split(" Avoid:")[0];

  if (/movie poster|extreme cinematic|dark mysterious boardroom|epic glowing chart/i.test(scenePart)) {
    issues.push("movie_poster_wording");
  }

  if ((spec.displayTitle || "").length > 40) {
    issues.push("display_title_too_long");
  }

  const eventDef = profile.eventDefinition;
  if (eventDef?.personPolicy === "institution_primary" && entities.person) {
    const personName = entities.person.names?.[0];
    if (personName && new RegExp(personName, "i").test(prompt) && !/Avoid:/i.test(prompt)) {
      issues.push("unexpected_person_in_institution_primary_prompt");
    }
  }

  if (eventDef?.personPolicy === "person_primary" && !entities.person) {
    issues.push("missing_required_person");
  }

  if (entities.institution && eventDef?.institution && entities.institution.id !== eventDef.institution) {
    issues.push("institution_mismatch");
  }

  if (entities.person && eventDef?.defaultPerson && entities.person.id !== eventDef.defaultPerson) {
    const allowed = PEOPLE[eventDef.defaultPerson];
    if (allowed && entities.person.id !== allowed.id) {
      issues.push("person_mismatch");
    }
  }

  if (!spec.primarySubjectType) {
    issues.push("missing_primary_subject_type");
  }

  if (!spec.overlayPlacement) {
    issues.push("missing_overlay_placement");
  }

  if (prompt.length < 120) {
    issues.push("prompt_too_generic");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  validatePromptSpec,
};
