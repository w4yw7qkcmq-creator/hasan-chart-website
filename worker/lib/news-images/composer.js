const { WIDTH, HEIGHT } = require("./fallback-visual-themes");
const { resolveAdaptiveLayout } = require("./adaptive-overlay-layout");
const { resolveEditorialHeadline, resolveEditorialHeadlineTypography } = require("./editorial-headline-typography");
const { resolveEditorialSubtitleFromContext } = require("./editorial-identity-director");
const {
  assertComposerInput,
  assertSingleBrandOverlay,
  assertSingleOfficialHeadline,
  createComposedFinalMetadata,
} = require("./image-stage");

const BRAND_NAME = "Economic Newsi";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveOfficialDisplayTitle(context = {}) {
  return resolveEditorialHeadline(context);
}

function buildSoftHeadlineGradient(gradient = {}) {
  const opacity = gradient.opacity || 0.13;
  return `
    <defs>
      <linearGradient id="headlineSoftFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="55%" stop-color="rgba(0,0,0,${opacity * 0.45})"/>
        <stop offset="100%" stop-color="rgba(0,0,0,${opacity})"/>
      </linearGradient>
    </defs>
    <rect x="${gradient.x}" y="${gradient.y}" width="${gradient.width}" height="${gradient.height}" fill="url(#headlineSoftFade)"/>
  `;
}

function buildSoftBrandGradient(gradient = {}) {
  const opacity = gradient.opacity || 0.17;
  return `
    <defs>
      <linearGradient id="brandSoftFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,${opacity})"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </linearGradient>
    </defs>
    <rect x="${gradient.x}" y="${gradient.y}" width="${gradient.width}" height="${gradient.height}" fill="url(#brandSoftFade)"/>
  `;
}

function resolveBrandSubtitle(context = {}) {
  if (context.editorialSubtitle) {
    return String(context.editorialSubtitle);
  }
  return resolveEditorialSubtitleFromContext(context);
}

function buildBrandOverlaySvg(context = {}, layout = {}) {
  const headlineTypography =
    layout.headlineTypography ||
    resolveEditorialHeadlineTypography({
      context,
      zoneWidth: layout.titleCandidate?.zone?.width || 620,
      zoneHeight: layout.titleCandidate?.zone?.height || 180,
    });
  const brand = layout.brandCandidate || {};
  const title = layout.titleCandidate || {};
  const titlePos = title.text || { x: 72, y: 540, anchor: "start" };
  const fontSize = headlineTypography.fontSize;
  const lineHeight = headlineTypography.lineHeight;
  const brandAnchor = brand.anchor || { x: 48, y: 42, badgeX: 83, badgeY: 86, nameX: 135, nameY: 74, subX: 135, subY: 99 };
  const brandSubtitle = resolveBrandSubtitle(context);

  const headlineTspans = headlineTypography.lines
    .map((line, index) => {
      const anchor =
        titlePos.anchor === "middle" ? ' text-anchor="middle"' : titlePos.anchor === "end" ? ' text-anchor="end"' : "";
      return `<tspan x="${titlePos.x}"${anchor} dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const gradients = [
    brand.softGradient ? buildSoftBrandGradient(brand.softGradient) : "",
    title.softGradient ? buildSoftHeadlineGradient(title.softGradient) : "",
  ].join("");

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${gradients}
      <rect x="${brandAnchor.x}" y="${brandAnchor.y}" width="69" height="69" rx="14" fill="rgba(255,255,255,0.08)" stroke="rgba(255,210,120,0.55)" stroke-width="2"/>
      <text x="${brandAnchor.badgeX}" y="${brandAnchor.badgeY}" text-anchor="middle" fill="#F5D78E" font-size="26" font-family="Arial, Helvetica, sans-serif" font-weight="700">EN</text>
      <text x="${brandAnchor.nameX}" y="${brandAnchor.nameY}" fill="#FFFFFF" font-size="26" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(BRAND_NAME)}</text>
      <text x="${brandAnchor.subX}" y="${brandAnchor.subY}" fill="rgba(255,255,255,0.72)" font-size="15" font-family="Arial, Helvetica, sans-serif">${escapeXml(brandSubtitle)}</text>
      <text x="${titlePos.x}" y="${titlePos.y}" fill="#FFFFFF" font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="700" stroke="rgba(0,0,0,${headlineTypography.shadowOpacity})" stroke-width="${headlineTypography.strokeWidth}" paint-order="stroke">${headlineTspans}</text>
    </svg>`;
}

async function composePremiumNewsImage(backgroundBuffer, context = {}, options = {}) {
  let sharp;
  try {
    sharp = options.sharp || require("sharp");
  } catch (_error) {
    throw new Error("sharp is required for composePremiumNewsImage");
  }

  const inputCheck = assertComposerInput(context.imageMetadata || options.imageMetadata || {});
  if (!inputCheck.ok && !options.allowComposedInput) {
    const error = new Error(inputCheck.reason);
    error.code = inputCheck.reason;
    error.issues = inputCheck.issues;
    throw error;
  }

  const overlayContext = {
    ...context,
    displayTitle: resolveOfficialDisplayTitle(context),
    eventName: resolveOfficialDisplayTitle(context),
  };

  let layout = options.adaptiveLayout;
  if (!layout) {
    layout = await resolveAdaptiveLayout(backgroundBuffer, overlayContext, { sharp });
  }

  layout.headlineTypography = resolveEditorialHeadlineTypography({
    context: overlayContext,
    zoneWidth: layout.titleCandidate?.zone?.width || 620,
    zoneHeight: layout.titleCandidate?.zone?.height || 180,
  });

  const overlaySvg = buildBrandOverlaySvg(overlayContext, layout);
  const brandGuard = assertSingleBrandOverlay(overlaySvg, resolveBrandSubtitle(overlayContext));
  const headlineGuard = assertSingleOfficialHeadline(overlaySvg, layout.headlineTypography.lines);
  if (!brandGuard.ok || !headlineGuard.ok) {
    throw new Error("SINGLE_OVERLAY_ASSERTION_FAILED");
  }

  const composed = await sharp(layout.workingBuffer || backgroundBuffer)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return {
    buffer: composed,
    adaptiveLayout: layout,
    displayTitle: overlayContext.displayTitle,
    headlineTypography: layout.headlineTypography,
    brandPlacement: layout.selectedBrandPlacement,
    titlePlacement: layout.selectedTitlePlacement,
    imageMetadata: createComposedFinalMetadata(),
    brandGuard,
    headlineGuard,
    layoutAction: "adaptive_layout",
  };
}

module.exports = {
  BRAND_NAME,
  composePremiumNewsImage,
  buildBrandOverlaySvg,
  resolveOfficialDisplayTitle,
  resolveEditorialHeadlineTypography,
  resolveBrandSubtitle,
  assertSingleBrandOverlay,
};
