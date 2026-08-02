const CPI_KEYS = new Set([
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CPI_GENERIC",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
]);

const NFP_KEYS = new Set([
  "US_NFP",
  "US_UNEMPLOYMENT_RATE",
  "US_ADP",
  "US_ADP_EMPLOYMENT",
  "US_INITIAL_JOBLESS_CLAIMS",
  "US_CONTINUING_JOBLESS_CLAIMS",
]);

const FED_KEYS = new Set([
  "US_FED_RATE_DECISION",
  "US_FED_STATEMENT",
  "US_FOMC_MINUTES",
  "US_BEIGE_BOOK",
  "US_JACKSON_HOLE",
]);

const POWELL_KEYS = new Set(["US_POWELL_SPEECH"]);

const ECB_KEYS = new Set(["ECB_RATE_DECISION", "ECB_LAGARDE_SPEECH"]);

const GDP_KEYS = new Set([
  "US_GDP_QOQ",
  "US_RETAIL_SALES",
  "US_CONSUMER_CONFIDENCE",
  "US_MICHIGAN_SENTIMENT",
]);

const PCE_KEYS = new Set(["US_CORE_PCE_MOM", "US_CORE_PCE_YOY", "US_PPI_MOM", "US_PPI_YOY"]);

const ISM_KEYS = new Set([
  "US_ISM_MANUFACTURING",
  "US_ISM_SERVICES",
  "US_PMI_MANUFACTURING",
  "US_PMI_SERVICES",
]);

const EVENT_ART_DIRECTIONS = {
  CPI: {
    group: "CPI",
    heroSubject:
      "real interior American supermarket aisle scene with consumer goods on shelves, authentic retail environment, not a shopping cart centered in frame",
    supportingSubjects: ["shopper examining price tags from a natural distance", "product shelf with packaged consumer goods"],
    forbiddenSubjects: [
      "large trading screens",
      "large charts",
      "government buildings",
      "multiple flags",
      "stacks of cash",
      "shopping cart as centered hero",
      "glowing market dashboards",
    ],
    cameraDirection: "documentary photography, natural eye-level perspective",
    lens: "50mm",
    depthOfField: "moderate depth of field with natural background falloff",
    lighting: "natural in-store daylight mixed with soft retail lighting",
    mood: "quiet consumer inflation atmosphere, everyday cost-of-living feeling",
    composition: "minimal editorial framing, hero aisle occupies one clear focal area, negative space preserved for overlay",
    realismLevel: "high photographic realism, looks like a real news photo not AI concept art",
    editorialNotes:
      "The image should feel like a major financial newspaper consumer inflation photo. It conveys the feeling of rising prices without explaining the news.",
  },
  NFP: {
    group: "NFP",
    heroSubject: "authentic American workplace environment or job interview setting with natural human scale",
    supportingSubjects: ["office workers in background", "professional desk with laptop"],
    forbiddenSubjects: ["large charts", "prominent dollar symbols", "gold bars", "multiple flags", "trading screens"],
    cameraDirection: "documentary photography, natural eye-level",
    lens: "35mm",
    depthOfField: "natural workplace depth, subject separation without blur gimmicks",
    lighting: "natural office daylight or soft professional interior lighting",
    mood: "labor market seriousness, hiring and employment atmosphere",
    composition: "single workplace hero, uncluttered editorial frame",
    realismLevel: "high photographic realism",
    editorialNotes: "Convey employment and hiring mood only. No macro symbols or market clutter.",
  },
  FED_BUILDING: {
    group: "FED",
    heroSubject: "Federal Reserve Eccles Building exterior as the sole architectural hero",
    supportingSubjects: ["official cars near entrance", "security presence at distance"],
    forbiddenSubjects: [
      "Jerome Powell unless event is a speech",
      "large charts",
      "multiple buildings",
      "multiple flags",
      "FOMC meeting room if building is hero",
    ],
    cameraDirection: "editorial architectural photography, slightly elevated natural angle",
    lens: "50mm",
    depthOfField: "deep enough to read institutional facade clearly",
    lighting: "natural institutional daylight, restrained and credible",
    mood: "measured central bank authority",
    composition: "building dominates as single hero, clean sky and facade lines",
    realismLevel: "high photographic realism",
    editorialNotes: "Policy decision atmosphere through architecture only. Restrained documentary tone, not theatrical.",
  },
  FED_ROOM: {
    group: "FED",
    heroSubject: "FOMC meeting room or official Federal Reserve policy room as sole interior hero",
    supportingSubjects: ["empty policy chairs and table", "subtle press or security presence at edge of frame"],
    forbiddenSubjects: [
      "Jerome Powell unless event is a speech",
      "Federal Reserve exterior if room is hero",
      "large charts",
      "multiple screens",
      "multiple flags",
    ],
    cameraDirection: "documentary interior photography, natural eye-level",
    lens: "35mm",
    depthOfField: "natural room depth, readable but not staged",
    lighting: "professional institutional conference lighting",
    mood: "policy decision gravity without drama",
    composition: "single room hero, minimal objects, editorial restraint",
    realismLevel: "high photographic realism",
    editorialNotes: "Interior policy atmosphere only. One room, one hero.",
  },
  POWELL: {
    group: "POWELL",
    heroSubject: "Jerome Powell as the sole human hero at a Federal Reserve press briefing",
    supportingSubjects: ["podium with microphones", "Federal Reserve press backdrop"],
    forbiddenSubjects: [
      "large Federal Reserve building exterior",
      "large charts",
      "multiple screens",
      "multiple flags",
      "crowded anonymous silhouettes",
    ],
    cameraDirection: "press conference documentary photography, natural eye-level",
    lens: "85mm",
    depthOfField: "moderate portrait depth, credible press photo separation",
    lighting: "realistic press briefing lighting",
    mood: "central bank communication, credible not theatrical",
    composition: "single speaker hero, restrained press environment",
    realismLevel: "high photographic realism",
    editorialNotes: "Person-led event. Powell is the hero. No building-as-co-hero.",
  },
  ECB: {
    group: "ECB",
    heroSubject: "ECB headquarters in Frankfurt as the sole architectural hero",
    supportingSubjects: ["Eurozone urban atmosphere", "Frankfurt skyline hint at distance"],
    forbiddenSubjects: ["Federal Reserve building", "US dollar symbolism", "US flag", "large charts", "multiple buildings"],
    cameraDirection: "editorial architectural photography, natural perspective",
    lens: "50mm",
    depthOfField: "institutional facade clarity with natural background",
    lighting: "modern European institutional daylight",
    mood: "euro-area monetary policy authority",
    composition: "single ECB building hero, clean European editorial frame",
    realismLevel: "high photographic realism",
    editorialNotes: "European central bank mood only. No US symbols.",
  },
  GDP: {
    group: "GDP",
    heroSubject: "active US port with shipping containers and trucks showing economic activity",
    supportingSubjects: ["logistics movement", "industrial commerce atmosphere"],
    forbiddenSubjects: ["charts", "trading screens", "multiple buildings", "flags as hero"],
    cameraDirection: "documentary industrial photography, natural eye-level",
    lens: "35mm",
    depthOfField: "wide environmental depth showing real economic movement",
    lighting: "natural daylight over commerce and logistics",
    mood: "broad economic activity and growth feeling",
    composition: "single port/logistics hero, no chart symbols",
    realismLevel: "high photographic realism",
    editorialNotes: "Show economic activity through real commerce, not data graphics.",
  },
  PCE: {
    group: "PCE",
    heroSubject: "authentic consumer spending scene with retail checkout or payment moment",
    supportingSubjects: ["shopping bags or basket from natural distance", "retail counter environment"],
    forbiddenSubjects: ["charts", "trading screens", "government buildings", "multiple flags"],
    cameraDirection: "documentary consumer photography, natural eye-level",
    lens: "50mm",
    depthOfField: "natural retail depth, one clear spending moment",
    lighting: "natural consumer environment lighting",
    mood: "everyday consumer spending and inflation sensitivity",
    composition: "single spending hero, minimal clutter",
    realismLevel: "high photographic realism",
    editorialNotes: "Consumer spending feeling only. No macro chart clutter.",
  },
  ISM: {
    group: "ISM",
    heroSubject: "active factory floor with machinery and production in motion",
    supportingSubjects: ["industrial equipment detail", "manufacturing worker at safe distance"],
    forbiddenSubjects: ["trading screens", "large charts", "office dashboards", "multiple buildings"],
    cameraDirection: "documentary industrial photography, natural eye-level",
    lens: "35mm",
    depthOfField: "environmental factory depth with one production hero zone",
    lighting: "industrial natural and practical factory lighting",
    mood: "manufacturing activity and business cycle feeling",
    composition: "single factory floor hero, no market-room clutter",
    realismLevel: "high photographic realism",
    editorialNotes: "Production and factory mood only. Not a trading desk photo.",
  },
  SELLOFF: {
    group: "SELLOFF",
    heroSubject: "single trader or portfolio manager reviewing market activity on a real trading floor",
    supportingSubjects: ["institutional desk monitors from natural distance", "exchange floor activity at soft background depth"],
    forbiddenSubjects: ["giant red stock arrow", "large glowing chart overlay", "multiple screens as co-hero", "smiling stock-photo poses"],
    cameraDirection: "market floor documentary photography, natural eye-level",
    lens: "50mm",
    depthOfField: "natural trading floor depth with one human hero zone",
    lighting: "realistic trading floor and office lighting",
    mood: "serious market sell-off atmosphere without cinematic drama",
    composition: "single market environment hero, no symbol stacking",
    realismLevel: "high photographic realism",
    editorialNotes: "Convey equity sell-off through authentic market environment, not giant red arrows or chart overlays.",
  },
  GOLD: {
    group: "GOLD",
    heroSubject: "institutional bullion desk or secure market storage environment as sole hero",
    supportingSubjects: ["subtle vault or custody infrastructure at distance", "professional market storage atmosphere"],
    forbiddenSubjects: ["luxury advertisement gold bars", "giant shiny gold stacks", "chart overlays", "dollar symbols", "neon shine"],
    cameraDirection: "commodity documentary photography, restrained natural angle",
    lens: "70mm",
    depthOfField: "controlled commodity depth with one storage hero zone",
    lighting: "warm neutral institutional lighting without advertisement shine",
    mood: "safe-haven and precious metals seriousness",
    composition: "single commodity environment hero, no luxury ad styling",
    realismLevel: "high photographic realism",
    editorialNotes: "Gold rally mood through institutional commodity context, not advertisement bullion glamour.",
  },
  OIL_ENERGY: {
    group: "OIL_ENERGY",
    heroSubject: "active oil terminal or refinery operations scene as sole industrial hero",
    supportingSubjects: ["pipeline or loading infrastructure at distance", "industrial worker at safe distance"],
    forbiddenSubjects: ["barrel plus chart plus dollar collage", "giant oil barrel symbol", "multiple energy icons", "neon industrial styling"],
    cameraDirection: "industrial documentary photography, straight natural angle",
    lens: "70mm",
    depthOfField: "environmental industrial depth with one production hero zone",
    lighting: "natural industrial daylight with restrained amber tones",
    mood: "energy supply seriousness and industrial realism",
    composition: "single industrial hero, no symbol clutter",
    realismLevel: "high photographic realism",
    editorialNotes: "Energy supply story through one real industrial scene only.",
  },
  CRYPTO_ETF: {
    group: "CRYPTO_ETF",
    heroSubject: "institutional digital asset desk or regulated trading office as sole hero",
    supportingSubjects: ["custody infrastructure hint at distance", "professional financial technology workspace"],
    forbiddenSubjects: ["neon cyberpunk styling", "giant bitcoin symbol", "meme crypto aesthetic", "glowing coin stacks", "chart overlays"],
    cameraDirection: "institutional technology documentary photography, contemporary natural angle",
    lens: "50mm",
    depthOfField: "modern office depth with one institutional hero zone",
    lighting: "modern dark neutral office lighting without neon",
    mood: "institutional crypto adoption, restrained and professional",
    composition: "single technology-finance hero, no hype styling",
    realismLevel: "high photographic realism",
    editorialNotes: "Institutional ETF flow mood through regulated finance technology, not crypto hype imagery.",
  },
  HORMUZ: {
    group: "HORMUZ",
    heroSubject: "oil tanker transit or maritime shipping lane scene as sole field hero",
    supportingSubjects: ["distant port or maritime control atmosphere", "shipping lane context at soft depth"],
    forbiddenSubjects: ["flag collage", "chart overlays", "barrel plus tanker plus dollar stacking", "war movie poster look"],
    cameraDirection: "long-lens maritime news coverage, natural elevated press angle",
    lens: "135mm",
    depthOfField: "compressed telephoto maritime depth with one vessel hero zone",
    lighting: "documentary maritime daylight, low saturation serious tone",
    mood: "geopolitical shipping risk without cinematic war styling",
    composition: "single maritime hero, no symbol clutter",
    realismLevel: "high photographic realism",
    editorialNotes: "Global trade tension through one authentic maritime scene linked to energy markets.",
  },
  CORPORATE_EARNINGS: {
    group: "CORPORATE_EARNINGS",
    heroSubject: "corporate headquarters exterior or earnings briefing room as sole business hero",
    supportingSubjects: ["executive briefing environment at distance", "professional reporting team hint"],
    forbiddenSubjects: ["giant stock ticker overlay", "multiple company logos", "chart collage", "smiling advertisement poses"],
    cameraDirection: "corporate financial documentary photography, natural eye-level",
    lens: "50mm",
    depthOfField: "natural corporate environment depth with one hero zone",
    lighting: "restrained corporate office and headquarters lighting",
    mood: "corporate earnings seriousness and business accountability",
    composition: "single corporate hero, clean professional frame",
    realismLevel: "high photographic realism",
    editorialNotes: "Corporate earnings mood through one authentic business environment.",
  },
  DEFAULT: {
    group: "DEFAULT",
    heroSubject: "credible macroeconomic editorial scene with one clear real-world subject",
    supportingSubjects: ["one subtle contextual detail"],
    forbiddenSubjects: ["multiple charts", "multiple screens", "multiple buildings", "multiple flags", "visual clutter"],
    cameraDirection: "documentary photography, natural eye-level",
    lens: "50mm",
    depthOfField: "natural editorial depth",
    lighting: "natural professional lighting",
    mood: "serious macro release atmosphere",
    composition: "single hero subject, minimal editorial frame",
    realismLevel: "high photographic realism",
    editorialNotes: "Convey event mood through one authentic scene, not symbol stacking.",
  },
};

function resolveArtDirectionGroup(eventKey) {
  const key = String(eventKey || "").trim().toUpperCase();
  if (CPI_KEYS.has(key)) return "CPI";
  if (NFP_KEYS.has(key)) return "NFP";
  if (POWELL_KEYS.has(key)) return "POWELL";
  if (ECB_KEYS.has(key)) return "ECB";
  if (GDP_KEYS.has(key)) return "GDP";
  if (PCE_KEYS.has(key)) return "PCE";
  if (ISM_KEYS.has(key)) return "ISM";
  if (FED_KEYS.has(key)) return "FED";
  if (/WALL_STREET_SELLOFF|MARKET_SELLOFF/.test(key)) return "SELLOFF";
  if (/GOLD_RALLY|XAU_RALLY/.test(key)) return "GOLD";
  if (/OIL_SUPPLY_DISRUPTION|ENERGY_DISRUPTION/.test(key)) return "OIL_ENERGY";
  if (/BITCOIN_ETF_FLOWS|CRYPTO_ETF/.test(key)) return "CRYPTO_ETF";
  if (/STRAIT_OF_HORMUZ_TENSION|HORMUZ/.test(key)) return "HORMUZ";
  if (/CORPORATE_EARNINGS_MAJOR|CORPORATE_EARNINGS/.test(key)) return "CORPORATE_EARNINGS";
  return "DEFAULT";
}

function listArtDirectionGroups() {
  return Object.keys(EVENT_ART_DIRECTIONS);
}

module.exports = {
  CPI_KEYS,
  NFP_KEYS,
  FED_KEYS,
  POWELL_KEYS,
  ECB_KEYS,
  GDP_KEYS,
  PCE_KEYS,
  ISM_KEYS,
  EVENT_ART_DIRECTIONS,
  resolveArtDirectionGroup,
  listArtDirectionGroups,
};
