const { PEOPLE } = require("./config/people");
const { INSTITUTIONS } = require("./config/institutions");
const { COUNTRIES } = require("./config/countries");
const { MARKETS } = require("./config/markets");

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function findByNames(registry, text) {
  const haystack = normalizeText(text);
  for (const entry of Object.values(registry)) {
    const names = [...(entry.names || []), ...(entry.aliases || [])];
    for (const name of names) {
      if (haystack.includes(normalizeText(name))) {
        return entry;
      }
    }
  }
  return null;
}

function resolvePerson(profile = {}, options = {}) {
  const eventDef = profile.eventDefinition;
  const combinedText = [profile.title, profile.summary, profile.sourceText, profile.person, profile.eventName]
    .filter(Boolean)
    .join(" ");

  if (eventDef?.defaultPerson && eventDef.personPolicy === "person_primary") {
    return PEOPLE[eventDef.defaultPerson] || null;
  }

  const explicit = profile.person ? findByNames(PEOPLE, profile.person) : null;
  if (explicit) {
    return explicit;
  }

  const mentioned = findByNames(PEOPLE, combinedText);
  if (!mentioned) {
    return null;
  }

  if (eventDef?.personPolicy === "institution_primary") {
    return null;
  }

  if (mentioned.portraitPolicy === "mention_only") {
    return null;
  }

  if (eventDef?.personPolicy === "person_primary") {
    return mentioned;
  }

  if (options.allowSecondary && mentioned.portraitPolicy === "secondary_only") {
    return mentioned;
  }

  return null;
}

function resolveInstitution(profile = {}) {
  const eventDef = profile.eventDefinition;
  if (eventDef?.institution && INSTITUTIONS[eventDef.institution]) {
    return INSTITUTIONS[eventDef.institution];
  }
  if (profile.institution && INSTITUTIONS[profile.institution]) {
    return INSTITUTIONS[profile.institution];
  }
  const combinedText = [profile.title, profile.summary, profile.sourceText, profile.eventName].filter(Boolean).join(" ");
  return findByNames(INSTITUTIONS, combinedText);
}

function resolveCountry(profile = {}) {
  const eventDef = profile.eventDefinition;
  const countryId = eventDef?.country || profile.country || "US";
  if (COUNTRIES[countryId]) {
    return COUNTRIES[countryId];
  }
  return findByNames(COUNTRIES, countryId) || COUNTRIES.US;
}

function resolveMarkets(profile = {}, limit = 3) {
  const eventDef = profile.eventDefinition;
  const ids = eventDef?.affectedMarkets || [];
  return ids
    .map((id) => MARKETS[id])
    .filter(Boolean)
    .slice(0, limit);
}

function resolveEntityBundle(profile = {}) {
  return {
    person: resolvePerson(profile),
    institution: resolveInstitution(profile),
    country: resolveCountry(profile),
    markets: resolveMarkets(profile, 3),
  };
}

module.exports = {
  resolvePerson,
  resolveInstitution,
  resolveCountry,
  resolveMarkets,
  resolveEntityBundle,
  findByNames,
};
