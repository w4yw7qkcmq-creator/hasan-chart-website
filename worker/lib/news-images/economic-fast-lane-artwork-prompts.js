const path = require("path");
const {
  ARTWORK_MANIFEST,
  listManifestEntries,
  getTotalArtworkCount,
} = require("./economic-fast-lane-artwork-manifest");

const SCENE_DIRECTIVES = [
  "photorealistic editorial economic-news photography",
  "realistic institutional or business environment",
  "absolutely no typography",
  "no logos",
  "no captions",
  "no numbers",
  "no dates",
  "no graphs containing readable labels",
  "no watermarks",
  "leave safe dark or clean regions in the upper-left and lower-left for editorial overlay",
  "professional international financial-news aesthetic",
].join(", ");

/** @type {Record<string, Array<{ scene: string, displayTitle: string, subtitle: string }>>} */
const CATEGORY_SCENE_DEFINITIONS = {
  fed: [
    {
      scene:
        "Federal Reserve press conference room with podium, microphones, and US flags, restrained institutional lighting, documentary news angle",
      displayTitle: "FEDERAL RESERVE",
      subtitle: "MONETARY POLICY",
    },
    {
      scene:
        "Federal Reserve headquarters exterior architecture in Washington with marble columns and institutional facade, overcast professional daylight",
      displayTitle: "FEDERAL RESERVE",
      subtitle: "INTEREST RATES",
    },
    {
      scene:
        "Central bank boardroom with mahogany table, leather chairs, and abstract unreadable institutional seal on wall, no readable documents",
      displayTitle: "FOMC DECISION",
      subtitle: "RATE OUTLOOK",
    },
    {
      scene:
        "Trading desk with analysts reacting to a rate decision, multiple monitors showing abstract blurred charts without readable labels",
      displayTitle: "FED DECISION",
      subtitle: "MARKET REACTION",
    },
    {
      scene:
        "Washington monetary-policy media briefing environment with cameras, tripods, and press risers, no readable signage",
      displayTitle: "FEDERAL RESERVE",
      subtitle: "POLICY BRIEFING",
    },
  ],
  cpi: [
    {
      scene: "Supermarket aisle with groceries and packaged goods, natural retail lighting, consumer price context without readable price tags",
      displayTitle: "US CPI",
      subtitle: "CONSUMER PRICES",
    },
    {
      scene: "Grocery basket with fresh produce and household staples on a neutral counter, editorial still-life composition",
      displayTitle: "US CPI",
      subtitle: "INFLATION WATCH",
    },
    {
      scene: "Retail checkout lane with barcode scanner and conveyor belt, shoppers partially visible, no readable receipts or screens",
      displayTitle: "US CPI",
      subtitle: "PRICE PRESSURE",
    },
    {
      scene: "Fuel pump and household cost environment with shopping bags nearby, realistic street-level documentary framing",
      displayTitle: "US CPI",
      subtitle: "COST OF LIVING",
    },
  ],
  nfp: [
    {
      scene: "Corporate office employment environment with desks, laptops, and professionals collaborating, bright modern workplace",
      displayTitle: "NONFARM PAYROLLS",
      subtitle: "US LABOR MARKET",
    },
    {
      scene: "Factory workforce on an assembly line wearing safety gear, industrial lighting, active production environment",
      displayTitle: "NONFARM PAYROLLS",
      subtitle: "JOB CREATION",
    },
    {
      scene: "Hiring and recruitment office with candidate interview table and HR workspace, no readable documents or nameplates",
      displayTitle: "NONFARM PAYROLLS",
      subtitle: "EMPLOYMENT REPORT",
    },
    {
      scene: "Construction workforce at an active building site with helmets and scaffolding, documentary economic activity scene",
      displayTitle: "NONFARM PAYROLLS",
      subtitle: "LABOR DEMAND",
    },
  ],
  jobs: [
    {
      scene: "Government jobless claims service counter with queue barriers and office interior, no readable forms or signage",
      displayTitle: "JOBLESS CLAIMS",
      subtitle: "US LABOR DATA",
    },
    {
      scene: "Unemployment and job center waiting area with chairs and information desk, subdued institutional lighting",
      displayTitle: "UNEMPLOYMENT",
      subtitle: "LABOR MARKET",
    },
    {
      scene: "Diverse employment workplace with staff in professional and service roles, candid editorial workplace scene",
      displayTitle: "US EMPLOYMENT",
      subtitle: "WORKFORCE UPDATE",
    },
    {
      scene: "Human resources recruiting office with interview room glass walls and talent acquisition workspace",
      displayTitle: "US JOBS",
      subtitle: "HIRING TRENDS",
    },
  ],
  "pmi-ism": [
    {
      scene: "Manufacturing factory floor with machinery, steel components, and workers in safety equipment",
      displayTitle: "MANUFACTURING PMI",
      subtitle: "FACTORY ACTIVITY",
    },
    {
      scene: "Services sector business meeting in a modern conference room with city view, no readable presentation screens",
      displayTitle: "SERVICES PMI",
      subtitle: "BUSINESS ACTIVITY",
    },
    {
      scene: "Logistics warehouse with forklifts, pallet racks, and shipping operations in motion",
      displayTitle: "ISM REPORT",
      subtitle: "SUPPLY CHAIN",
    },
    {
      scene: "Factory management quality inspection walkthrough on a production line, documentary industrial framing",
      displayTitle: "PMI DATA",
      subtitle: "PRODUCTION OUTLOOK",
    },
  ],
  eia: [
    {
      scene: "Crude oil storage tanks at an industrial terminal under cloudy sky, wide environmental documentary shot",
      displayTitle: "EIA INVENTORIES",
      subtitle: "CRUDE STOCKS",
    },
    {
      scene: "Petroleum refinery with distillation towers, pipes, and steam, industrial energy infrastructure",
      displayTitle: "EIA REPORT",
      subtitle: "REFINERY FLOW",
    },
    {
      scene: "Gasoline fuel infrastructure with pumps and storage canopy at dusk, no readable price displays",
      displayTitle: "EIA DATA",
      subtitle: "FUEL SUPPLY",
    },
    {
      scene: "Cushing oil storage tank farm with rows of white storage vessels, aerial-leaning wide composition",
      displayTitle: "EIA INVENTORIES",
      subtitle: "CUSHING STOCKS",
    },
    {
      scene: "Energy terminal with pipeline infrastructure, loading arms, and maritime/industrial backdrop",
      displayTitle: "EIA REPORT",
      subtitle: "ENERGY MARKETS",
    },
  ],
  ecb: [
    {
      scene: "European Central Bank press conference room with podium and euro-area flags, institutional broadcast lighting",
      displayTitle: "ECB DECISION",
      subtitle: "EUROZONE RATES",
    },
    {
      scene: "ECB headquarters exterior in Frankfurt with modern tower architecture and glass facade",
      displayTitle: "EUROPEAN CENTRAL BANK",
      subtitle: "MONETARY POLICY",
    },
    {
      scene: "Eurozone institutional boardroom with European design details and abstract euro sculpture, no readable documents",
      displayTitle: "ECB POLICY",
      subtitle: "EURO AREA",
    },
    {
      scene: "European financial district skyline at blue hour with banking towers and river foreground",
      displayTitle: "ECB WATCH",
      subtitle: "EUROPEAN MARKETS",
    },
  ],
  boe: [
    {
      scene: "Bank of England historic building on Threadneedle Street with stone facade and street-level documentary angle",
      displayTitle: "BANK OF ENGLAND",
      subtitle: "UK RATES",
    },
    {
      scene: "Bank of England monetary policy press briefing room with wood paneling and institutional seating",
      displayTitle: "BOE DECISION",
      subtitle: "MONETARY POLICY",
    },
  ],
  boj: [
    {
      scene: "Bank of Japan headquarters in Tokyo with modern institutional architecture and urban context",
      displayTitle: "BANK OF JAPAN",
      subtitle: "POLICY DECISION",
    },
    {
      scene: "Bank of Japan policy meeting boardroom with long table and restrained Tokyo institutional interior",
      displayTitle: "BOJ POLICY",
      subtitle: "JAPAN RATES",
    },
  ],
  "central-banks": [
    {
      scene: "International central bank governors conference hall with round tables and global flags, no readable name cards",
      displayTitle: "CENTRAL BANKS",
      subtitle: "GLOBAL POLICY",
    },
    {
      scene: "Global monetary policy summit in a grand institutional hall with stage and delegate seating",
      displayTitle: "CENTRAL BANKS",
      subtitle: "RATE OUTLOOK",
    },
  ],
  inflation: [
    {
      scene: "Consumer price shopping environment with market stalls and packaged goods, inflation context without readable labels",
      displayTitle: "INFLATION",
      subtitle: "PRICE PRESSURE",
    },
    {
      scene: "Wholesale market goods environment with crates and industrial shelving, documentary supply-side framing",
      displayTitle: "INFLATION DATA",
      subtitle: "PRICE TRENDS",
    },
  ],
  gdp: [
    {
      scene: "National economic output scene combining factory, commerce, and transport activity in one editorial frame",
      displayTitle: "GDP REPORT",
      subtitle: "ECONOMIC GROWTH",
    },
    {
      scene: "Construction cranes and infrastructure development skyline representing capital formation and expansion",
      displayTitle: "GDP DATA",
      subtitle: "OUTPUT UPDATE",
    },
    {
      scene: "Corporate earnings and business growth environment with executives reviewing abstract charts on blurred screens",
      displayTitle: "GDP OUTLOOK",
      subtitle: "ACTIVITY TRACKER",
    },
  ],
  "retail-sales": [
    {
      scene: "Retail store with shoppers browsing aisles and merchandise displays, no readable price tags",
      displayTitle: "RETAIL SALES",
      subtitle: "US CONSUMER",
    },
    {
      scene: "Shopping mall consumer spending environment with escalators and storefronts, documentary commerce scene",
      displayTitle: "RETAIL DATA",
      subtitle: "SPENDING TREND",
    },
  ],
  "consumer-confidence": [
    {
      scene: "Consumer sentiment survey research office with analysts and abstract data boards without readable content",
      displayTitle: "CONSUMER CONFIDENCE",
      subtitle: "SENTIMENT INDEX",
    },
    {
      scene: "Household consumer decision environment with family budgeting context at a kitchen table, no readable papers",
      displayTitle: "CONFIDENCE DATA",
      subtitle: "US HOUSEHOLDS",
    },
  ],
  "generic-us-economic": [
    {
      scene: "US Capitol and economic policy environment with government buildings and civic plaza, documentary Washington scene",
      displayTitle: "US ECONOMY",
      subtitle: "MACRO UPDATE",
    },
    {
      scene: "Wall Street financial district with street canyon, bankers walking, and market atmosphere at morning light",
      displayTitle: "US MARKETS",
      subtitle: "ECONOMIC NEWS",
    },
  ],
  "generic-eurozone-economic": [
    {
      scene: "Brussels European institutional economic environment with modern EU quarter architecture",
      displayTitle: "EUROZONE ECONOMY",
      subtitle: "MACRO UPDATE",
    },
    {
      scene: "Euro currency and European commerce scene with abstract euro coins and business district backdrop, no readable denominations",
      displayTitle: "EURO AREA",
      subtitle: "ECONOMIC NEWS",
    },
  ],
  "generic-economic": [
    {
      scene: "Global macroeconomic editorial scene with world finance motifs, trading floor silhouettes, and international skyline blend",
      displayTitle: "GLOBAL ECONOMY",
      subtitle: "MACRO DATA",
    },
  ],
};

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
        path: `${category}/${filename}`,
        category,
        filename,
        scenePrompt: buildScenePrompt(sceneDef.scene),
        displayTitle: sceneDef.displayTitle,
        subtitle: sceneDef.subtitle,
      });
    });
  }

  return definitions;
}

const ARTWORK_PROMPT_DEFINITIONS = buildPromptDefinitions();

function getPromptDefinitionMap() {
  return new Map(ARTWORK_PROMPT_DEFINITIONS.map((definition) => [definition.path, definition]));
}

function getPromptDefinitionForEntry(entry) {
  const map = getPromptDefinitionMap();
  return map.get(entry.relativePath) || null;
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

  const seenPaths = new Set();
  for (const definition of ARTWORK_PROMPT_DEFINITIONS) {
    if (seenPaths.has(definition.path)) {
      issues.push({ code: "DUPLICATE_PROMPT_PATH", path: definition.path });
    }
    seenPaths.add(definition.path);

    if (!/no typography/i.test(definition.scenePrompt)) {
      issues.push({ code: "MISSING_NO_TYPOGRAPHY_DIRECTIVE", path: definition.path });
    }
    if (/Economic Newsi|Macro Data|\bEN badge\b|\brender EN\b/i.test(definition.scenePrompt)) {
      issues.push({ code: "OVERLAY_TEXT_IN_SCENE_PROMPT", path: definition.path });
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

  return { ok: issues.length === 0, issues, total: ARTWORK_PROMPT_DEFINITIONS.length };
}

module.exports = {
  SCENE_DIRECTIVES,
  CATEGORY_SCENE_DEFINITIONS,
  ARTWORK_PROMPT_DEFINITIONS,
  buildScenePrompt,
  buildPromptDefinitions,
  getPromptDefinitionMap,
  getPromptDefinitionForEntry,
  validatePromptDefinitionsAgainstManifest,
};
