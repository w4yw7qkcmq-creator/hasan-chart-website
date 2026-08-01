const { WIDTH, HEIGHT } = require("./fallback-image-provider");

const BRAND_NAME = "Economic Newsi";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapEventName(name, maxCharsPerLine = 22) {
  const words = String(name || "Economic Release").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function buildBrandOverlaySvg(context = {}) {
  const eventLines = wrapEventName(context.eventName);
  const lineYStart = 360;
  const lineHeight = 58;
  const eventTspans = eventLines
    .map((line, index) => `<tspan x="600" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="frameFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.15)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.72)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#frameFade)"/>
      <rect x="64" y="56" width="92" height="92" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,210,120,0.55)" stroke-width="2"/>
      <text x="110" y="114" text-anchor="middle" fill="#F5D78E" font-size="34" font-family="Arial, Helvetica, sans-serif" font-weight="700">EN</text>
      <text x="180" y="98" fill="#FFFFFF" font-size="34" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(BRAND_NAME)}</text>
      <text x="180" y="132" fill="rgba(255,255,255,0.72)" font-size="20" font-family="Arial, Helvetica, sans-serif">Official Macro Release</text>
      <text x="600" y="${lineYStart}" text-anchor="middle" fill="#FFFFFF" font-size="54" font-family="Arial, Helvetica, sans-serif" font-weight="700">${eventTspans}</text>
    </svg>`;
}

async function composePremiumNewsImage(backgroundBuffer, context = {}) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (_error) {
    throw new Error("sharp is required for composePremiumNewsImage");
  }

  const overlaySvg = Buffer.from(buildBrandOverlaySvg(context));
  const composed = await sharp(backgroundBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .composite([{ input: overlaySvg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return composed;
}

module.exports = {
  BRAND_NAME,
  composePremiumNewsImage,
  buildBrandOverlaySvg,
  wrapEventName,
};
