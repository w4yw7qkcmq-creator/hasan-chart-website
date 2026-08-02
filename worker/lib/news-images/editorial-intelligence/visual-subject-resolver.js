const { resolveEntityBundle } = require("./entity-resolver");

function resolveVisualSubjects(profile = {}, entities = {}) {
  const eventDef = profile.eventDefinition || {};
  const person = entities.person;
  const institution = entities.institution;
  const primary = [];
  const secondary = [];
  const forbidden = [...(eventDef.forbiddenElements || [])];

  if (eventDef.personPolicy === "person_primary" && person) {
    primary.push(person.visualDescription);
  } else if (institution) {
    primary.push(...(eventDef.primaryVisualSubjects || institution.visualSubjects || []));
  } else {
    primary.push(...(eventDef.primaryVisualSubjects || []));
  }

  secondary.push(...(eventDef.secondaryVisualSubjects || []));
  if (institution?.symbolicElements) {
    secondary.push(...institution.symbolicElements.slice(0, 2));
  }

  const dedupedPrimary = unique(primary);
  const dedupedSecondary = unique(secondary).filter(
    (item) => !dedupedPrimary.some((existing) => existing.toLowerCase().includes(item.toLowerCase().replace(/^subtle\s+/i, "")))
  );

  if (eventDef.personPolicy === "institution_primary" && person) {
    forbidden.push(`${person.names?.[0]} as primary subject`);
  }

  if (institution?.forbiddenMisrepresentations) {
    forbidden.push(...institution.forbiddenMisrepresentations);
  }

  return {
    primary: dedupedPrimary,
    secondary: dedupedSecondary.slice(0, 4),
    forbidden: unique(forbidden),
    primarySubjectType: eventDef.personPolicy === "person_primary" && person ? "person" : "institution",
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

module.exports = {
  resolveVisualSubjects,
};
