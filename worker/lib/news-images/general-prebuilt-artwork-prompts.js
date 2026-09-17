const {
  ARTWORK_MANIFEST,
  listManifestEntries,
  getTotalArtworkCount,
} = require("./general-prebuilt-artwork-manifest");

const SCENE_DIRECTIVES = [
  "photorealistic high-detail editorial economic-news photography",
  "Reuters Bloomberg CNBC-style professionally exposed natural color",
  "proper exposure with clear midtones and visible environmental detail",
  "rich believable natural colors and strong subject visibility",
  "prefer daylight golden hour blue hour or bright overcast or well-lit institutional interiors",
  "cinematic composition and depth only, not darkness or underexposure",
  "avoid underexposure low-key lighting crushed blacks or brand-navy photograph tint",
  "subjects must not be black silhouettes unless distant background elements only",
  "absolutely no typography",
  "no logos",
  "no captions",
  "no numbers",
  "no dates",
  "no prices",
  "no percentages",
  "no graphs containing readable labels",
  "no watermarks",
  "no gore",
  "no graphic destruction",
  "no propaganda or victory messaging",
  "leave clean readable regions in the upper-left and lower-left for local overlay gradients only",
  "optimized for Telegram mobile viewing",
].join(", ");

const FORBIDDEN_DARK_SCENE_PHRASES = [
  /dark navy scene/i,
  /black cinematic treatment/i,
  /\bvery dark\b/i,
  /moody darkness/i,
  /deep shadows/i,
  /near-black background/i,
  /dramatically underexposed/i,
  /dark industrial environment/i,
  /dark navy ambient/i,
  /dark navy treatment/i,
  /darkened trading floor/i,
];

/**
 * @typedef {Object} SceneDefinition
 * @property {string} scene
 * @property {string} displayTitle
 * @property {string} subtitle
 * @property {string[]} routingTags
 * @property {number} [selectionPriority]
 */

/** @type {Record<string, SceneDefinition[]>} */
const CATEGORY_SCENE_DEFINITIONS = {
  "iran-us": [
    {
      scene:
        "Photorealistic daylight golden-hour editorial military aviation scene: modern fighter aircraft clearly visible with surface details, blue warm atmospheric sky, Middle Eastern landscape, distant smoke or strike plume on horizon, realistic sunlight and natural color, aircraft not silhouettes, generic editorial illustration, non-graphic, no casualties, no bodies, no gore, not documentation of a specific real attack",
      displayTitle: "US — IRAN",
      subtitle: "MILITARY ESCALATION",
      routingTags: ["iran", "military", "escalation", "air-strike"],
      selectionPriority: 10,
    },
    {
      scene:
        "Photorealistic bright overcast editorial scene: military aircraft in flight with visible details over distant city and industrial horizon, natural daylight, distant smoke haze, properly exposed international news atmosphere, non-graphic, no casualties, generic editorial illustration",
      displayTitle: "US — IRAN",
      subtitle: "AIR OPERATIONS",
      routingTags: ["iran", "air-operations", "military", "regional"],
      selectionPriority: 10,
    },
    {
      scene:
        "Generic editorial news illustration: military naval vessels at sea in Middle Eastern waters with aircraft visible at distance, serious regional tension composition, calm documentary framing, non-graphic, no combat close-ups, no casualties, not documentation of a specific real incident, reusable neutral illustration",
      displayTitle: "US — IRAN",
      subtitle: "REGIONAL TENSIONS",
      routingTags: ["iran", "naval", "middle-east", "regional"],
      selectionPriority: 10,
    },
    {
      scene:
        "US and Iranian flags in neutral diplomatic negotiation setting, institutional conference room, marble and wood table, equal flag prominence, sanctions and diplomacy context, generic editorial illustration, no readable documents, not documentation of a specific real meeting",
      displayTitle: "US — IRAN",
      subtitle: "DIPLOMATIC DEVELOPMENTS",
      routingTags: ["iran", "diplomacy", "talks", "sanctions"],
      selectionPriority: 10,
    },
    {
      scene:
        "Washington institutional government building exterior with US policy briefing atmosphere combined with subtle Iran visual context via flags at edge of frame, economic and diplomatic pressure theme, generic editorial illustration, no readable signage, not documentation of a specific real policy event",
      displayTitle: "US — IRAN",
      subtitle: "SANCTIONS & POLICY",
      routingTags: ["iran", "sanctions", "policy", "united-states"],
      selectionPriority: 10,
    },
    {
      scene:
        "Photorealistic blue-hour editorial scene with visible military jets and readable aircraft details, regional sky with natural color, distant smoke flash on horizon, properly exposed Middle Eastern atmosphere, non-graphic, no casualties, generic editorial breaking-news illustration, not documentation of a specific real attack",
      displayTitle: "US — IRAN",
      subtitle: "BREAKING DEVELOPMENTS",
      routingTags: ["iran", "breaking", "escalation", "military"],
      selectionPriority: 10,
    },
  ],
  "oil-up": [
    {
      scene:
        "Photorealistic daylight golden-hour petroleum industry photograph: prominent crude oil barrels and recognizable oil pumpjack in foreground, petroleum refinery infrastructure behind, warm natural sunlight, blue sky, metallic industrial colors, visible details, petroleum unmistakable, no glowing oil, no price boards, no charts",
      displayTitle: "OIL PRICES",
      subtitle: "MARKET RALLY",
      routingTags: ["oil", "crude", "rise", "rally"],
      selectionPriority: 20,
    },
    {
      scene:
        "Large oil storage tanks dominating frame with petroleum pipelines and valve manifolds, visible crude oil handling infrastructure, premium commodities editorial photography, petroleum unmistakable, no readable gauges",
      displayTitle: "CRUDE OIL",
      subtitle: "PRICES RISE",
      routingTags: ["crude", "oil", "gain", "energy"],
      selectionPriority: 20,
    },
    {
      scene:
        "Large crude oil tanker at sea approaching petroleum terminal, hull and loading context clearly oil shipping, open ocean supply route, documentary financial-news angle, petroleum unmistakable",
      displayTitle: "OIL MARKETS",
      subtitle: "SUPPLY CONCERNS",
      routingTags: ["oil", "tanker", "supply", "brent", "wti"],
      selectionPriority: 20,
    },
    {
      scene:
        "Multiple oil pumpjacks across petroleum production field at golden hour, nodding donkeys prominent, crude extraction environment, petroleum unmistakable, no numeric displays, no infographics",
      displayTitle: "ENERGY MARKETS",
      subtitle: "OIL GAINS",
      routingTags: ["oil", "energy", "production", "rally"],
      selectionPriority: 20,
    },
  ],
  "oil-down": [
    {
      scene:
        "Crude oil barrels stacked at petroleum terminal with oil storage tanks and pipelines visible, overcast subdued lighting, petroleum unmistakable, no readable signage, no price data",
      displayTitle: "OIL PRICES",
      subtitle: "MARKET DECLINE",
      routingTags: ["oil", "crude", "fall", "decline"],
      selectionPriority: 20,
    },
    {
      scene:
        "Oil storage tanks and petroleum pipeline network connected to recognizable refinery crude-processing units, grey sky, petroleum infrastructure dominant, petroleum unmistakable, no infographics",
      displayTitle: "CRUDE OIL",
      subtitle: "PRICES FALL",
      routingTags: ["crude", "oil", "drop", "weak-demand"],
      selectionPriority: 20,
    },
    {
      scene:
        "Crude oil tanker anchored at large petroleum terminal with loading arms and storage tanks, wide documentary composition, petroleum unmistakable, no battle imagery",
      displayTitle: "OIL MARKETS",
      subtitle: "SUPPLY PRESSURE",
      routingTags: ["oil", "tankers", "supply", "glut"],
      selectionPriority: 20,
    },
    {
      scene:
        "Multiple pumpjacks and petroleum production infrastructure across extraction field, muted color grade, petroleum unmistakable, no giant arrows or fake charts",
      displayTitle: "ENERGY MARKETS",
      subtitle: "OIL RETREATS",
      routingTags: ["oil", "energy", "retreat", "decline"],
      selectionPriority: 20,
    },
  ],
  gold: [
    {
      scene: "Physical gold bars stacked in institutional vault lighting, premium precious-metals still life, no assay stamps readable",
      displayTitle: "GOLD",
      subtitle: "PRECIOUS METALS",
      routingTags: ["gold", "precious-metals", "bullion"],
      selectionPriority: 15,
    },
    {
      scene: "Institutional bullion vault corridor with secure doors and gold storage cages, cool documentary lighting",
      displayTitle: "GOLD MARKETS",
      subtitle: "SAFE HAVEN",
      routingTags: ["gold", "safe-haven", "vault"],
      selectionPriority: 15,
    },
    {
      scene: "Professional commodities trading desk with gold-themed monitors showing abstract blurred charts, no readable numbers",
      displayTitle: "GOLD",
      subtitle: "MARKET MOVES",
      routingTags: ["gold", "commodities", "markets"],
      selectionPriority: 15,
    },
    {
      scene: "Gold bullion on desk with macro financial environment, world map and abstract finance props blurred, premium composition",
      displayTitle: "PRECIOUS METALS",
      subtitle: "GOLD MARKETS",
      routingTags: ["gold", "precious-metals", "macro"],
      selectionPriority: 15,
    },
    {
      scene: "Premium bright gold market composition with ingots, soft natural spotlight, neutral institutional background with realistic gold tones, properly exposed",
      displayTitle: "GOLD",
      subtitle: "GLOBAL MARKETS",
      routingTags: ["gold", "global-markets"],
      selectionPriority: 15,
    },
  ],
  usd: [
    {
      scene: "Institutional US dollar and currency trading environment, FX desk with abstract blurred screens, no exchange rates visible",
      displayTitle: "US DOLLAR",
      subtitle: "CURRENCY MARKETS",
      routingTags: ["usd", "dollar", "dxy", "fx"],
      selectionPriority: 15,
    },
    {
      scene: "US currency notes and coins arranged with American financial district skyline through window, documentary editorial style",
      displayTitle: "US DOLLAR",
      subtitle: "MARKET MOVES",
      routingTags: ["dollar", "usd", "greenback"],
      selectionPriority: 15,
    },
    {
      scene: "Macroeconomic institutional scene with dollar symbolism and central bank aesthetic props, no readable data",
      displayTitle: "USD",
      subtitle: "GLOBAL FX",
      routingTags: ["usd", "forex", "fx"],
      selectionPriority: 15,
    },
    {
      scene: "Well-lit professional FX market floor environment with traders at multi-monitor desks, natural display colors, charts unreadable",
      displayTitle: "US DOLLAR",
      subtitle: "FOREX MARKETS",
      routingTags: ["dollar", "forex", "currency"],
      selectionPriority: 15,
    },
  ],
  "us-economy": [
    {
      scene: "US business district skyline in clear daylight with natural city colors, corporate towers and urban commerce, properly exposed economic-news framing",
      displayTitle: "US ECONOMY",
      subtitle: "ECONOMIC DEVELOPMENTS",
      routingTags: ["us-economy", "united-states", "gdp", "macro"],
      selectionPriority: 12,
    },
    {
      scene: "American logistics hub with containers, freight, and production activity, realistic commerce environment",
      displayTitle: "UNITED STATES",
      subtitle: "ECONOMIC OUTLOOK",
      routingTags: ["us-economy", "logistics", "commerce"],
      selectionPriority: 12,
    },
    {
      scene: "American commercial street and retail commerce activity, institutional documentary tone, no readable store prices",
      displayTitle: "US ECONOMY",
      subtitle: "MACRO DEVELOPMENTS",
      routingTags: ["us-economy", "macro", "developments"],
      selectionPriority: 12,
    },
  ],
  "fed-general": [
    {
      scene: "Federal Reserve institutional building exterior, marble and columns, overcast Washington daylight, not a numeric FOMC release scene",
      displayTitle: "FEDERAL RESERVE",
      subtitle: "CENTRAL BANK NEWS",
      routingTags: ["fed", "federal-reserve", "central-bank"],
      selectionPriority: 14,
    },
    {
      scene: "Monetary policy press briefing room with podium and cameras, abstract institutional seals, no readable headlines",
      displayTitle: "FEDERAL RESERVE",
      subtitle: "POLICY DEVELOPMENTS",
      routingTags: ["fed", "monetary-policy", "press"],
      selectionPriority: 14,
    },
    {
      scene: "Washington central-bank institutional interior corridor with security and formal architecture, neutral policy context",
      displayTitle: "FED",
      subtitle: "MONETARY POLICY",
      routingTags: ["fed", "fomc", "policy"],
      selectionPriority: 14,
    },
  ],
  geopolitics: [
    {
      scene: "Well-lit international diplomatic summit round table with multiple flags, delegates in soft focus, bright institutional conference room, neutral global developments",
      displayTitle: "GEOPOLITICS",
      subtitle: "GLOBAL DEVELOPMENTS",
      routingTags: ["geopolitics", "summit", "diplomacy"],
      selectionPriority: 11,
    },
    {
      scene: "Neutral international flags and government building plaza, security barriers, documentary news angle",
      displayTitle: "GLOBAL TENSIONS",
      subtitle: "GEOPOLITICS",
      routingTags: ["geopolitics", "tensions", "international"],
      selectionPriority: 11,
    },
    {
      scene: "International sanctions and diplomacy setting with conference microphones and empty treaty table, no readable documents",
      displayTitle: "GEOPOLITICS",
      subtitle: "DIPLOMACY & SANCTIONS",
      routingTags: ["geopolitics", "sanctions", "diplomacy"],
      selectionPriority: 11,
    },
    {
      scene: "Neutral regional security institutional imagery, government briefing room with world map screen unreadable",
      displayTitle: "BREAKING NEWS",
      subtitle: "GEOPOLITICAL DEVELOPMENTS",
      routingTags: ["geopolitics", "breaking", "security"],
      selectionPriority: 11,
    },
  ],
  "hormuz-shipping": [
    {
      scene: "Daylight bright sea with blue water, commercial crude oil tanker clearly visible transiting Strait-style shipping lane, natural ocean colors, energy transport context, no combat",
      displayTitle: "STRAIT OF HORMUZ",
      subtitle: "SHIPPING & ENERGY",
      routingTags: ["hormuz", "strait", "tanker", "shipping"],
      selectionPriority: 18,
    },
    {
      scene: "Multiple commercial tankers on a major oil supply shipping route at sea, wide documentary composition",
      displayTitle: "GLOBAL SHIPPING",
      subtitle: "OIL SUPPLY ROUTES",
      routingTags: ["shipping", "tankers", "supply-routes", "hormuz"],
      selectionPriority: 18,
    },
    {
      scene: "Port terminal with tanker berthed and energy transport infrastructure, cranes and pipelines, supply risk context without battle imagery",
      displayTitle: "ENERGY SHIPPING",
      subtitle: "SUPPLY RISKS",
      routingTags: ["shipping", "port", "energy", "disruption"],
      selectionPriority: 18,
    },
  ],
  "china-markets": [
    {
      scene: "Shanghai or Chinese financial district skyline with modern towers, overcast premium editorial framing, no readable tickers",
      displayTitle: "CHINA",
      subtitle: "ECONOMIC DEVELOPMENTS",
      routingTags: ["china", "shanghai", "economy"],
      selectionPriority: 13,
    },
    {
      scene: "Chinese industrial and commerce environment with manufacturing and logistics activity, realistic documentary tone",
      displayTitle: "CHINA MARKETS",
      subtitle: "ECONOMIC OUTLOOK",
      routingTags: ["china", "markets", "industrial"],
      selectionPriority: 13,
    },
    {
      scene: "Well-lit institutional Chinese financial market trading floor with natural urban colors, monitors with abstract blurred charts, properly exposed",
      displayTitle: "CHINESE ECONOMY",
      subtitle: "GLOBAL MARKETS",
      routingTags: ["china", "chinese-economy", "equities"],
      selectionPriority: 13,
    },
  ],
  "global-markets-up": [
    {
      scene: "Realistic global financial trading floor with active but orderly mood, monitors with unreadable charts, risk-on atmosphere without arrow infographics",
      displayTitle: "GLOBAL MARKETS",
      subtitle: "RISK-ON",
      routingTags: ["global-markets", "risk-on", "equities"],
      selectionPriority: 25,
    },
    {
      scene: "Stock exchange interior with traders and upward energy in body language, abstract blurred market screens, no giant green arrows",
      displayTitle: "STOCK MARKETS",
      subtitle: "MARKET RALLY",
      routingTags: ["stocks", "rally", "equities", "risk-on"],
      selectionPriority: 25,
    },
    {
      scene: "Global equities research desk with international skyline visible, positive sentiment through lighting not graphics",
      displayTitle: "GLOBAL EQUITIES",
      subtitle: "POSITIVE SENTIMENT",
      routingTags: ["equities", "sentiment", "rally"],
      selectionPriority: 25,
    },
  ],
  "global-markets-down": [
    {
      scene: "Well-lit global financial market environment, traders focused, cool grey daylight on trading floor, realistic display colors, risk-off mood without red arrow graphics",
      displayTitle: "GLOBAL MARKETS",
      subtitle: "RISK-OFF",
      routingTags: ["global-markets", "risk-off", "selloff"],
      selectionPriority: 25,
    },
    {
      scene: "Stock market trading desk under cool grey lighting, selling pressure mood, unreadable declining abstract charts",
      displayTitle: "STOCK MARKETS",
      subtitle: "SELLING PRESSURE",
      routingTags: ["stocks", "selloff", "decline"],
      selectionPriority: 25,
    },
    {
      scene: "Global equities monitoring room with serious analysts, institutional decline mood, no infographic overlays",
      displayTitle: "GLOBAL EQUITIES",
      subtitle: "MARKET DECLINE",
      routingTags: ["equities", "decline", "risk-off"],
      selectionPriority: 25,
    },
  ],
  crypto: [
    {
      scene: "Bitcoin physical coin prop on institutional trading desk with professional monitors showing abstract crypto charts, no meme aesthetics",
      displayTitle: "CRYPTO MARKETS",
      subtitle: "DIGITAL ASSETS",
      routingTags: ["crypto", "bitcoin", "digital-assets"],
      selectionPriority: 16,
    },
    {
      scene: "Broader digital asset market environment with server room and finance desk blend, cool blue institutional lighting",
      displayTitle: "CRYPTO",
      subtitle: "MARKET MOVES",
      routingTags: ["crypto", "digital-assets", "blockchain"],
      selectionPriority: 16,
    },
    {
      scene: "Institutional blockchain and Bitcoin market environment with secure data center and trading screens blurred",
      displayTitle: "DIGITAL ASSETS",
      subtitle: "GLOBAL MARKETS",
      routingTags: ["bitcoin", "crypto", "institutional"],
      selectionPriority: 16,
    },
  ],
  "breaking-economic": [
    {
      scene: "Bright well-lit international economic newsroom backdrop with world finance motifs, natural colors, reusable fallback composition",
      displayTitle: "BREAKING NEWS",
      subtitle: "ECONOMIC DEVELOPMENTS",
      routingTags: ["breaking", "fallback", "economic"],
      selectionPriority: 1,
    },
    {
      scene: "Global economy editorial scene with skyline blend and abstract finance elements, neutral fallback artwork",
      displayTitle: "ECONOMIC NEWS",
      subtitle: "GLOBAL ECONOMY",
      routingTags: ["fallback", "global-economy", "economic"],
      selectionPriority: 1,
    },
  ],
};

const FORBIDDEN_BRANDING_PATTERNS = [
  /HasaN\s*CharT/i,
  /ForexBreakingNews/i,
  /ForexNewspaper/i,
  /t\.me\//i,
];

const FORBIDDEN_OVERLAY_NUMERIC_PATTERNS = [
  /\$\d/,
  /\d+\.\d+%/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  /\b\d{1,2}:\d{2}\b/,
];

/** Scene text (pre-directives) must include at least one approved petroleum visual noun */
const PETROLEUM_VISUAL_NOUN_PATTERN =
  /\b(crude oil|oil barrel|oil barrels|pumpjack|pumpjacks|oil tanker|crude oil tanker|petroleum pipeline|oil storage tank|oil storage tanks|petroleum terminal|petroleum production)\b/i;

const OIL_DIRECTIONAL_CATEGORIES = new Set(["oil-up", "oil-down"]);

const IRAN_US_MILITARY_SCENE_IDS = new Set([
  "iran-us/01.jpg",
  "iran-us/02.jpg",
  "iran-us/03.jpg",
  "iran-us/06.jpg",
]);

const IRAN_US_EDITORIAL_SAFETY_PATTERN =
  /\b(generic editorial|neutral editorial|non-graphic|not documentation of a specific|reusable neutral illustration|no gore|no casualties|no bodies)\b/i;

const IRAN_US_MILITARY_MOTIF_PATTERN =
  /\b(military jets?|military aircraft|fighter aircraft|air-strike|naval vessels?|military naval|explosion illumination|distant smoke)\b/i;

function buildScenePrompt(sceneDescription) {
  return `${sceneDescription}. ${SCENE_DIRECTIVES}.`;
}

function buildPromptDefinitions() {
  const definitions = [];

  for (const [category, scenes] of Object.entries(CATEGORY_SCENE_DEFINITIONS)) {
    const manifestFiles = ARTWORK_MANIFEST[category];
    if (!manifestFiles || manifestFiles.length !== scenes.length) {
      throw new Error(
        `Category scene count mismatch for ${category}: manifest=${manifestFiles?.length || 0}, scenes=${scenes.length}`
      );
    }

    scenes.forEach((sceneDef, index) => {
      const filename = manifestFiles[index];
      definitions.push({
        id: `${category}-${filename.replace(/\.jpg$/, "")}`,
        path: `${category}/${filename}`,
        category,
        filename,
        scenePrompt: buildScenePrompt(sceneDef.scene),
        displayTitle: sceneDef.displayTitle,
        subtitle: sceneDef.subtitle,
        routingTags: sceneDef.routingTags || [],
        selectionPriority: sceneDef.selectionPriority ?? 5,
      });
    });
  }

  return definitions;
}

const ARTWORK_PROMPT_DEFINITIONS = buildPromptDefinitions();

function getPromptDefinitionMap() {
  return new Map(ARTWORK_PROMPT_DEFINITIONS.map((definition) => [definition.path, definition]));
}

function sceneTextFromDefinition(definition) {
  const built = definition.scenePrompt || "";
  const splitIndex = built.indexOf(`. ${SCENE_DIRECTIVES}`);
  if (splitIndex === -1) {
    return built;
  }
  return built.slice(0, splitIndex);
}

function validateSemanticScenePrompts(definitions = ARTWORK_PROMPT_DEFINITIONS) {
  const issues = [];

  for (const definition of definitions) {
    const sceneText = sceneTextFromDefinition(definition);

    if (OIL_DIRECTIONAL_CATEGORIES.has(definition.category)) {
      if (!PETROLEUM_VISUAL_NOUN_PATTERN.test(sceneText)) {
        issues.push({
          code: "MISSING_PETROLEUM_VISUAL_NOUN",
          path: definition.path,
          category: definition.category,
        });
      }
    }

    if (definition.category === "iran-us") {
      if (!IRAN_US_EDITORIAL_SAFETY_PATTERN.test(sceneText)) {
        issues.push({
          code: "MISSING_IRAN_US_EDITORIAL_SAFETY",
          path: definition.path,
        });
      }
    }

    if (IRAN_US_MILITARY_SCENE_IDS.has(definition.path)) {
      if (!IRAN_US_MILITARY_MOTIF_PATTERN.test(sceneText)) {
        issues.push({
          code: "MISSING_IRAN_US_MILITARY_MOTIF",
          path: definition.path,
        });
      }
    }

    for (const pattern of FORBIDDEN_DARK_SCENE_PHRASES) {
      if (pattern.test(sceneText)) {
        issues.push({
          code: "FORBIDDEN_DARK_SCENE_PHRASE",
          path: definition.path,
        });
      }
    }
  }

  if (/properly exposed|natural color|professionally exposed/i.test(SCENE_DIRECTIVES) === false) {
    issues.push({ code: "MISSING_BRIGHT_EXPOSURE_DIRECTIVE" });
  }

  return { ok: issues.length === 0, issues };
}

function listCatalogEntries(baseDir) {
  const promptMap = getPromptDefinitionMap();
  return listManifestEntries(baseDir).map((entry) => {
    const prompt = promptMap.get(entry.relativePath);
    return {
      ...entry,
      displayTitle: prompt?.displayTitle || "",
      subtitle: prompt?.subtitle || "",
      scenePrompt: prompt?.scenePrompt || "",
      routingTags: prompt?.routingTags || [],
      selectionPriority: prompt?.selectionPriority ?? 5,
    };
  });
}

function validatePromptDefinitionsAgainstManifest(baseDir) {
  const issues = [];
  const manifestEntries = listManifestEntries(baseDir);
  const map = getPromptDefinitionMap();

  if (ARTWORK_PROMPT_DEFINITIONS.length !== 50) {
    issues.push({
      code: "PROMPT_COUNT_MISMATCH",
      expected: 50,
      actual: ARTWORK_PROMPT_DEFINITIONS.length,
    });
  }

  if (getTotalArtworkCount() !== 50) {
    issues.push({ code: "MANIFEST_TOTAL_MISMATCH", expected: 50, actual: getTotalArtworkCount() });
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    if (seenPaths.has(definition.path)) {
      issues.push({ code: "DUPLICATE_PROMPT_PATH", path: definition.path });
    }
    seenPaths.add(definition.path);

    if (seenIds.has(definition.id)) {
      issues.push({ code: "DUPLICATE_PROMPT_ID", id: definition.id });
    }
    seenIds.add(definition.id);

    if (!definition.displayTitle?.trim()) {
      issues.push({ code: "MISSING_DISPLAY_TITLE", path: definition.path });
    }
    if (!definition.subtitle?.trim()) {
      issues.push({ code: "MISSING_SUBTITLE", path: definition.path });
    }
    if (!definition.scenePrompt?.trim()) {
      issues.push({ code: "MISSING_SCENE_PROMPT", path: definition.path });
    }
    if (!/no typography/i.test(definition.scenePrompt)) {
      issues.push({ code: "MISSING_NO_TYPOGRAPHY_DIRECTIVE", path: definition.path });
    }

    const overlayText = `${definition.displayTitle} ${definition.subtitle}`;
    for (const pattern of FORBIDDEN_BRANDING_PATTERNS) {
      if (pattern.test(overlayText) || pattern.test(definition.scenePrompt)) {
        issues.push({ code: "FORBIDDEN_BRANDING", path: definition.path });
      }
    }
    for (const pattern of FORBIDDEN_OVERLAY_NUMERIC_PATTERNS) {
      if (pattern.test(overlayText)) {
        issues.push({ code: "FORBIDDEN_NUMERIC_OVERLAY", path: definition.path });
      }
    }
  }

  for (const entry of manifestEntries) {
    if (!map.has(entry.relativePath)) {
      issues.push({ code: "MISSING_PROMPT_FOR_MANIFEST_ENTRY", path: entry.relativePath });
    }
  }

  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    if (!manifestEntries.some((entry) => entry.relativePath === definition.path)) {
      issues.push({ code: "PROMPT_WITHOUT_MANIFEST_ENTRY", path: definition.path });
    }
  }

  const semantic = validateSemanticScenePrompts();
  issues.push(...semantic.issues);

  return { ok: issues.length === 0, issues, total: ARTWORK_PROMPT_DEFINITIONS.length };
}

module.exports = {
  SCENE_DIRECTIVES,
  CATEGORY_SCENE_DEFINITIONS,
  ARTWORK_PROMPT_DEFINITIONS,
  FORBIDDEN_BRANDING_PATTERNS,
  FORBIDDEN_DARK_SCENE_PHRASES,
  PETROLEUM_VISUAL_NOUN_PATTERN,
  validateSemanticScenePrompts,
  buildScenePrompt,
  buildPromptDefinitions,
  getPromptDefinitionMap,
  listCatalogEntries,
  validatePromptDefinitionsAgainstManifest,
};
