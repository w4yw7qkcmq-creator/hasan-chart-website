const { hashSeed, buildReleaseSeed, createSeededRandom } = require("../fallback-visual-themes");
const {
  EVENT_ART_DIRECTIONS,
  resolveArtDirectionGroup,
} = require("./config/event-art-directions");
const { GLOBAL_CLUTTER_RULES, GLOBAL_FORBIDDEN_SUBJECTS } = require("./config/global-rules");

function pickFedHeroVariant(profile = {}) {
  const seed = hashSeed(buildReleaseSeed(profile));
  const rand = createSeededRandom(seed);
  return rand() < 0.5 ? "FED_BUILDING" : "FED_ROOM";
}

function resolveTemplate(profile = {}, entities = {}) {
  const group = resolveArtDirectionGroup(profile.canonicalEventKey || profile.eventKey);
  if (group === "FED") {
    const variant = pickFedHeroVariant(profile);
    return EVENT_ART_DIRECTIONS[variant];
  }
  if (group === "POWELL" && entities.person) {
    return {
      ...EVENT_ART_DIRECTIONS.POWELL,
      heroSubject: `${entities.person.names?.[0] || "Jerome Powell"} as the sole human hero at a Federal Reserve press briefing`,
    };
  }
  if (group === "ECB" && entities.person && profile.eventDefinition?.personPolicy === "person_primary") {
    return {
      ...EVENT_ART_DIRECTIONS.ECB,
      group: "ECB_SPEECH",
      heroSubject: `${entities.person.names?.[0] || "ECB president"} as the sole human hero at an ECB press briefing`,
      supportingSubjects: ["podium with microphones", "ECB institutional backdrop"],
      forbiddenSubjects: [
        ...EVENT_ART_DIRECTIONS.ECB.forbiddenSubjects,
        "ECB headquarters exterior as co-hero",
        "large charts",
      ],
    };
  }
  return EVENT_ART_DIRECTIONS[group] || EVENT_ART_DIRECTIONS.DEFAULT;
}

function mergeForbidden(template = {}, profile = {}, entities = {}) {
  const eventForbidden = profile.eventDefinition?.forbiddenElements || [];
  const institutionForbidden = entities.institution?.forbiddenMisrepresentations || [];
  return [...new Set([
    ...GLOBAL_FORBIDDEN_SUBJECTS,
    ...(template.forbiddenSubjects || []),
    ...eventForbidden,
    ...institutionForbidden,
    ...GLOBAL_CLUTTER_RULES,
  ])].slice(0, 24);
}

function resolveEditorialArtDirection(profile = {}, entities = {}, visualSubjects = {}, composition = {}) {
  const template = resolveTemplate(profile, entities);
  const supportingSubjects = (template.supportingSubjects || []).slice(0, 2);

  return {
    eventKey: profile.canonicalEventKey || profile.eventKey,
    artDirectionGroup: template.group,
    heroSubject: template.heroSubject,
    supportingSubjects,
    forbiddenSubjects: mergeForbidden(template, profile, entities),
    cameraDirection: template.cameraDirection,
    lens: template.lens,
    depthOfField: template.depthOfField,
    lighting: template.lighting,
    mood: template.mood,
    composition: template.composition,
    realismLevel: template.realismLevel,
    editorialNotes: template.editorialNotes,
    primarySubjectType:
      composition.primarySubjectType ||
      visualSubjects.primarySubjectType ||
      (template.group === "POWELL" || template.group === "ECB_SPEECH" ? "person" : "institution"),
    displayTitle: profile.displayTitle,
    country: entities.country?.names?.[0] || profile.country,
    institution: entities.institution?.names?.[0] || null,
  };
}

module.exports = {
  resolveEditorialArtDirection,
  pickFedHeroVariant,
  resolveTemplate,
};
