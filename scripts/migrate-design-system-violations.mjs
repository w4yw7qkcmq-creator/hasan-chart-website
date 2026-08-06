#!/usr/bin/env node
/**
 * Targeted design-system violation fixes — only explicit file list, never theme sources.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const SKIP = new Set([
  "app/components/ui/ui-theme.js",
  "app/components/order-book/order-book-theme.js",
]);

const REPLACEMENTS = [
  [
    /public-seo-page relative min-h-screen overflow-hidden bg-\[#020617\] text-white/g,
    "ui-public-seo-page public-seo-page ui-text-strong",
  ],
  [
    /public-seo-page relative min-h-screen overflow-hidden bg-\[#020617\] ui-text-strong/g,
    "ui-public-seo-page public-seo-page ui-text-strong",
  ],
  [
    /public-seo-page relative min-h-screen overflow-x-hidden overflow-y-visible bg-\[#020617\] text-white/g,
    "ui-public-seo-page public-seo-page ui-text-strong overflow-x-hidden overflow-y-visible",
  ],
  [
    /public-seo-hero relative overflow-hidden rounded-\[34px\] border border-cyan-300\/15 bg-gradient-to-br from-\[#07142f\]\/85 via-\[#040b1c\]\/90 to-\[#020617\]\/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12/g,
    "ui-public-seo-hero public-seo-hero",
  ],
  [
    /public-seo-card rounded-\[34px\] border border-cyan-300\/15 bg-white\/\[0\.045\] p-8 shadow-2xl backdrop-blur-2xl md:p-10/g,
    "ui-public-seo-card public-seo-card",
  ],
  [
    /public-seo-card rounded-\[28px\] border border-cyan-300\/15 bg-white\/\[0\.045\] p-6 shadow-xl backdrop-blur-2xl/g,
    "ui-public-seo-card ui-public-seo-card--compact public-seo-card",
  ],
  [
    /public-seo-card rounded-\[24px\] border border-cyan-300\/15 bg-white\/\[0\.045\] p-6 text-center shadow-xl backdrop-blur-2xl/g,
    "ui-public-seo-card ui-public-seo-card--compact public-seo-card text-center",
  ],
  [
    /public-seo-card rounded-\[24px\] border border-cyan-300\/15 bg-white\/\[0\.045\] p-5 shadow-xl backdrop-blur-2xl/g,
    "ui-public-seo-card ui-public-seo-card--compact public-seo-card",
  ],
  [
    /public-seo-card group rounded-\[24px\] border border-cyan-300\/15 bg-white\/\[0\.04\] p-5 backdrop-blur-xl/g,
    "ui-public-seo-card ui-public-seo-card--faq group public-seo-card",
  ],
  [
    /public-seo-card rounded-\[24px\] border border-cyan-300\/15 bg-white\/\[0\.04\] p-5 backdrop-blur-xl/g,
    "ui-public-seo-card ui-public-seo-card--faq public-seo-card",
  ],
  [
    /public-seo-card overflow-hidden rounded-\[28px\] border border-cyan-300\/15 bg-white\/\[0\.045\] shadow-xl backdrop-blur-2xl/g,
    "ui-public-seo-card ui-public-seo-card--compact public-seo-card overflow-hidden shadow-xl",
  ],
  [
    /pointer-events-none absolute inset-0 bg-\[radial-gradient\(circle_at_12%_8%,rgba\(0,102,255,0\.35\),transparent_30%\),radial-gradient\(circle_at_86%_35%,rgba\(34,211,238,0\.16\),transparent_30%\),linear-gradient\(135deg,#020617,#07142f_48%,#030712\)\]/g,
    "ui-public-seo-page__backdrop pointer-events-none absolute inset-0",
  ],
  [
    /pointer-events-none absolute inset-0 opacity-\[0\.13\] bg-\[linear-gradient\(90deg,rgba\(255,255,255,0\.08\)_1px,transparent_1px\),linear-gradient\(rgba\(255,255,255,0\.06\)_1px,transparent_1px\)\] bg-\[size:76px_76px\]/g,
    "ui-public-seo-page__grid pointer-events-none absolute inset-0",
  ],
  [/bg-\[#020617\]/g, "ui-page-dark"],
  [/bg-\[#111827\]/g, "ui-input-dark"],
  [/bg-white\/\[0\.045\]/g, "ui-glass-045"],
  [/bg-white\/\[0\.04\]/g, "ui-glass-04"],
  [/bg-white\/\[0\.06\]/g, "ui-glass-06"],
  [/bg-white\/95/g, "ui-surface-elevated"],
  [/bg-white\/25/g, "ui-glass-25"],
  [/bg-white\/15/g, "ui-glass-15"],
  [/bg-white\/10/g, "ui-glass-10"],
  [/bg-white\/\[0\.03\]/g, "ui-glass-03"],
  [/bg-white\/20/g, "ui-glass-20"],
  [/bg-white\/30/g, "ui-glass-30"],
  [/hover:bg-white\/30/g, "hover:ui-glass-30"],
  [/hover:bg-white\/25/g, "hover:ui-glass-25"],
  [/border-white bg-white/g, "border-[var(--ui-border)] ui-glass-solid"],
  [/\bbg-white\b/g, "ui-glass-solid"],
  [/from-\[#0b63ff\]/g, "from-[var(--blue-main)]"],
  [/via-\[#00a3ff\]/g, "via-[var(--ui-accent)]"],
  [/to-\[#020617\]/g, "to-[var(--ui-page-dark-bg)]"],
  [/bg-\[#07142f\]/g, "ui-glass-panel"],
  [/color:\s*['"]#ffffff['"]/g, "color: 'var(--ui-hero-cta-primary-text)'"],
  [/WebkitTextFillColor:\s*['"]#ffffff['"]/g, "WebkitTextFillColor: 'var(--ui-hero-cta-primary-text)'"],
  [/textShadow:\s*['"]0 2px 0 #000[^'"]*['"]/g, "textShadow: 'var(--ui-home-label-shadow-lg)'"],
  [/textShadow:\s*['"]0 1px 0 #000[^'"]*['"]/g, "textShadow: 'var(--ui-home-label-shadow-sm)'"],
  [/border:\s*["']1px solid #facc15["']/g, 'border: "1px solid var(--ui-warning)"'],
  [/color:\s*["']#92400e["']/g, 'color: "var(--ui-warning)"'],
  [/text-slate-900/g, "ui-text-strong"],
  [/border-slate-/g, "border-[var(--ui-border)]"],
];

function stripDarkUtilities(className) {
  return className
    .replace(/\bdark:bg-[^\s"']+/g, "")
    .replace(/\bdark:text-[^\s"']+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function addUiSelectImport(content, relPath) {
  if (!content.includes("<UiSelect") || content.includes("UiSelect")) {
    if (content.includes("<UiSelect") && !/import[^;]*UiSelect/.test(content)) {
      if (relPath.startsWith("app/components/iam/") || relPath.startsWith("app/components/partner/") || relPath.startsWith("app/components/notification-hub/")) {
        return `import { UiSelect } from "../ui";\n${content}`;
      }
      if (relPath.startsWith("app/(app)/admin/")) {
        return content.replace(/^(import .+\n)/m, '$1import { UiSelect } from "../../../components/ui";\n');
      }
      if (relPath.startsWith("app/(app)/")) {
        return content.replace(/^(import .+\n)/m, '$1import { UiSelect } from "../../components/ui";\n');
      }
    }
  }
  return content;
}

function migrateFile(relPath) {
  if (SKIP.has(relPath) || relPath.startsWith("app/components/ui/")) return false;
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return false;

  let content = readFileSync(abs, "utf8");
  const original = content;

  for (const [pattern, replacement] of REPLACEMENTS) {
    content = content.replace(pattern, replacement);
  }

  // Strip dark: utilities everywhere in class strings
  content = content.replace(/\bdark:[^\s"'`]+/g, "");
  content = content.replace(/className="([^"]*)"/g, (_, cls) => `className="${stripDarkUtilities(cls)}"`);
  content = content.replace(/className=\{`([^`]*)`\}/g, (_, cls) => `className={\`${stripDarkUtilities(cls)}\`}`);
  content = content.replace(/"([^"]*\bdark:[^"]*)"/g, (m, s) => `"${s.replace(/\bdark:[^\s"]+/g, "").replace(/\s{2,}/g, " ").trim()}"`);

  if (content.includes("<select") && !relPath.startsWith("app/components/ui/")) {
    content = addUiSelectImport(content, relPath);
    content = content.replace(/<select/g, "<UiSelect");
    content = content.replace(/<\/select>/g, "<\/UiSelect>");
  }

  if (relPath === "app/components/order-book/fear-greed-gauge.js") {
    content = content
      .replace('"#dc2626"', '"var(--ui-chart-fear-extreme)"')
      .replace('"#f97316"', '"var(--ui-chart-fear)"')
      .replace('"#eab308"', '"var(--ui-chart-neutral-mid)"')
      .replace('"#84cc16"', '"var(--ui-chart-greed-mid)"')
      .replace('"#059669"', '"var(--ui-chart-greed-extreme)"');
  }

  if (relPath === "app/components/CopyArticleButton.js") {
    content = content.replace(
      /className="inline-flex appearance-none items-center rounded-2xl border border-sky-500\/40 bg-sky-600 px-4 py-3 text-sm font-black !text-white shadow-xl shadow-sky-600\/20 transition hover:scale-105 hover:bg-sky-700[^"]*"/,
      'className="ui-copy-article-btn"'
    );
  }

  if (relPath === "app/components/order-book/FearGreedCard.js") {
    content = content.replace(/dark:bg-black\/20/g, "ob-skeleton-shimmer");
    content = content.replace(/bg-black\/5 dark:bg-black\/20/g, "ob-skeleton-shimmer");
    content = content.replace(/bg-black\/5/g, "ob-skeleton-shimmer");
    content = content.replace(/"#64748b"/g, '"var(--ui-chart-fallback)"');
    content = content.replace(/var\(--ob-surface, #fff\)/g, "var(--ob-surface-elevated)");
  }

  if (content !== original) {
    writeFileSync(abs, content, "utf8");
    return true;
  }
  return false;
}

// Discover violating files dynamically
import { readdirSync } from "node:fs";
import { relative } from "node:path";
import { UNSAFE_UI_PATTERNS, FINANCIAL_CHART_ALLOWLIST } from "../app/components/ui/ui-theme.js";

function listJsFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) listJsFiles(abs, acc);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) acc.push(abs);
  }
  return acc;
}

function scan(relPath, content) {
  if (FINANCIAL_CHART_ALLOWLIST.some((t) => content.includes(t))) return [];
  const violations = [];
  for (const pattern of UNSAFE_UI_PATTERNS) {
    if (pattern.test(content)) violations.push(pattern);
  }
  return violations;
}

const targets = [];
for (const dir of ["app/components", "app/(app)", "app/(public)"].map((d) => join(ROOT, d))) {
  for (const abs of listJsFiles(dir)) {
    const rel = relative(ROOT, abs);
    if (SKIP.has(rel)) continue;
    const content = readFileSync(abs, "utf8");
    if (scan(rel, content).length) targets.push(rel);
  }
}

let changed = 0;
for (const rel of targets) {
  if (migrateFile(rel)) changed += 1;
}
console.log(`migrate: ${changed}/${targets.length} violating files updated`);
