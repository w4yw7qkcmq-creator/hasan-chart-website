const WIDTH = 1200;
const HEIGHT = 675;

const CATEGORY_PALETTES = {
  fed: { hues: [210, 225, 240], accent: "#F5D78E", motif: "institutional" },
  inflation: { hues: [15, 28, 42], accent: "#FFB86C", motif: "inflation" },
  labor: { hues: [160, 175, 190], accent: "#7EE787", motif: "labor" },
  growth: { hues: [95, 110, 125], accent: "#79C0FF", motif: "growth" },
  pmi: { hues: [265, 280, 295], accent: "#D2A8FF", motif: "pmi" },
};

const FED_KEYS = new Set([
  "US_FED_RATE_DECISION",
  "US_FED_STATEMENT",
  "US_POWELL_SPEECH",
]);
const INFLATION_KEYS = new Set([
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CPI_GENERIC",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
  "US_PPI",
  "US_PPI_MOM",
  "US_PPI_YOY",
]);
const LABOR_KEYS = new Set([
  "US_NFP",
  "US_UNEMPLOYMENT_RATE",
  "US_INITIAL_JOBLESS_CLAIMS",
  "US_CONTINUING_JOBLESS_CLAIMS",
  "US_ADP",
]);
const GROWTH_KEYS = new Set([
  "US_GDP_QOQ",
  "US_PCE",
  "US_CORE_PCE_MOM",
  "US_CORE_PCE_YOY",
  "US_RETAIL_SALES",
  "US_CORE_RETAIL_SALES",
]);
const PMI_KEYS = new Set([
  "US_ISM_MANUFACTURING",
  "US_ISM_SERVICES",
  "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
  "US_SP_GLOBAL_FLASH_SERVICES_PMI",
]);

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value || "economic");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function resolveVisualCategory(eventKey = "") {
  const key = String(eventKey || "").trim().toUpperCase();
  if (FED_KEYS.has(key)) {
    return "fed";
  }
  if (INFLATION_KEYS.has(key)) {
    return "inflation";
  }
  if (LABOR_KEYS.has(key)) {
    return "labor";
  }
  if (GROWTH_KEYS.has(key)) {
    return "growth";
  }
  if (PMI_KEYS.has(key)) {
    return "pmi";
  }
  return "growth";
}

function buildReleaseSeed(context = {}) {
  const eventKey = String(context.eventKey || context.eventName || "EVENT").trim().toUpperCase();
  const country = String(context.country || "US").trim().toUpperCase();
  const releaseTime = context.releaseTime ? new Date(context.releaseTime).toISOString() : "unknown";
  const releaseDate = releaseTime.slice(0, 10);
  return `${eventKey}|${country}|${releaseDate}|${releaseTime}`;
}

function pickGradientMode(rand) {
  const modes = ["linear", "radial", "diagonal", "split"];
  return modes[Math.floor(rand() * modes.length)];
}

function buildCategoryDecorations(category, rand, palette) {
  const parts = [];
  const accent = palette.accent;

  if (category === "fed") {
    parts.push(`<rect x="860" y="120" width="220" height="320" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(245,215,142,0.25)" stroke-width="2"/>`);
    parts.push(`<rect x="890" y="160" width="160" height="18" rx="4" fill="rgba(245,215,142,0.18)"/>`);
    parts.push(`<rect x="890" y="200" width="120" height="12" rx="3" fill="rgba(255,255,255,0.08)"/>`);
    parts.push(`<circle cx="980" cy="420" r="46" fill="none" stroke="${accent}" stroke-width="2" opacity="0.35"/>`);
  } else if (category === "inflation") {
    for (let i = 0; i < 5; i += 1) {
      const x = 780 + i * 38 + Math.floor(rand() * 10);
      const h = 80 + Math.floor(rand() * 140);
      parts.push(`<rect x="${x}" y="${520 - h}" width="24" height="${h}" rx="6" fill="rgba(255,184,108,${0.12 + rand() * 0.12})"/>`);
    }
    parts.push(`<path d="M760 520 Q900 420 1080 300" fill="none" stroke="${accent}" stroke-width="3" opacity="0.35"/>`);
  } else if (category === "labor") {
    for (let i = 0; i < 6; i += 1) {
      const x = 760 + i * 55;
      const y = 430 + Math.floor(rand() * 70);
      parts.push(`<circle cx="${x}" cy="${y}" r="${14 + Math.floor(rand() * 10)}" fill="rgba(126,231,135,${0.08 + rand() * 0.1})"/>`);
    }
    parts.push(`<rect x="820" y="500" width="260" height="8" rx="4" fill="rgba(126,231,135,0.22)"/>`);
  } else if (category === "growth") {
    parts.push(`<path d="M740 520 L820 460 L910 480 L990 390 L1080 420" fill="none" stroke="${accent}" stroke-width="4" opacity="0.4"/>`);
    parts.push(`<circle cx="990" cy="390" r="10" fill="${accent}" opacity="0.5"/>`);
    parts.push(`<rect x="860" y="170" width="180" height="110" rx="12" fill="rgba(121,192,255,0.08)" stroke="rgba(121,192,255,0.2)" stroke-width="2"/>`);
  } else if (category === "pmi") {
    for (let i = 0; i < 4; i += 1) {
      const cx = 820 + i * 60;
      const cy = 420 + Math.floor(rand() * 40);
      parts.push(`<rect x="${cx}" y="${cy}" width="36" height="36" rx="8" transform="rotate(${Math.floor(rand() * 20 - 10)} ${cx + 18} ${cy + 18})" fill="rgba(210,168,255,0.12)" stroke="rgba(210,168,255,0.28)" stroke-width="2"/>`);
    }
  }

  const orbCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < orbCount; i += 1) {
    const cx = Math.floor(rand() * WIDTH);
    const cy = Math.floor(rand() * HEIGHT * 0.7);
    const r = 20 + Math.floor(rand() * 80);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,${0.015 + rand() * 0.02})"/>`);
  }

  return parts.join("\n");
}

function buildFallbackBackgroundSvg(context = {}) {
  const seedSource = buildReleaseSeed(context);
  const seed = hashSeed(seedSource);
  const rand = createSeededRandom(seed);
  const category = resolveVisualCategory(context.eventKey);
  const palette = CATEGORY_PALETTES[category] || CATEGORY_PALETTES.growth;
  const hueBase = palette.hues[Math.floor(rand() * palette.hues.length)];
  const hueShift = Math.floor(rand() * 24);
  const hueA = (hueBase + hueShift) % 360;
  const hueB = (hueBase + 40 + Math.floor(rand() * 30)) % 360;
  const hueC = (hueBase + 90 + Math.floor(rand() * 40)) % 360;
  const gradientMode = pickGradientMode(rand);
  const glowX = 25 + Math.floor(rand() * 50);
  const glowY = 20 + Math.floor(rand() * 35);

  let gradientDef = "";
  if (gradientMode === "radial") {
    gradientDef = `
      <radialGradient id="bg" cx="${glowX}%" cy="${glowY}%" r="75%">
        <stop offset="0%" stop-color="hsl(${hueA}, 44%, 16%)"/>
        <stop offset="55%" stop-color="hsl(${hueB}, 38%, 10%)"/>
        <stop offset="100%" stop-color="hsl(${hueC}, 30%, 5%)"/>
      </radialGradient>`;
  } else if (gradientMode === "split") {
    gradientDef = `
      <linearGradient id="bg" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="hsl(${hueA}, 42%, 7%)"/>
        <stop offset="45%" stop-color="hsl(${hueB}, 36%, 13%)"/>
        <stop offset="100%" stop-color="hsl(${hueC}, 28%, 8%)"/>
      </linearGradient>`;
  } else {
    const angle = Math.floor(rand() * 360);
    gradientDef = `
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${angle} 0.5 0.5)">
        <stop offset="0%" stop-color="hsl(${hueA}, 42%, 8%)"/>
        <stop offset="55%" stop-color="hsl(${hueB}, 36%, 14%)"/>
        <stop offset="100%" stop-color="hsl(${hueC}, 28%, 6%)"/>
      </linearGradient>`;
  }

  const decorations = buildCategoryDecorations(category, rand, palette);
  const gridOpacity = 0.04 + rand() * 0.04;
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gradientDef}
        <radialGradient id="glow" cx="${glowX}%" cy="${glowY}%" r="60%">
          <stop offset="0%" stop-color="rgba(255,210,120,0.16)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0 H0 V48" fill="none" stroke="rgba(255,255,255,${gridOpacity})" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      <rect width="100%" height="100%" fill="url(#glow)"/>
      ${decorations}
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.18)"/>
    </svg>`;

  return {
    svg,
    seed,
    seedSource,
    visualCategory: category,
    gradientMode,
  };
}

module.exports = {
  WIDTH,
  HEIGHT,
  CATEGORY_PALETTES,
  hashSeed,
  buildReleaseSeed,
  resolveVisualCategory,
  buildFallbackBackgroundSvg,
  createSeededRandom,
};
