import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = process.argv[2];
const arabicTitle = process.argv[3] || "عنوان الصفحة";
const englishTitle = process.argv[4] || "Page Title";

if (!route || !/^[\w-]+$/.test(route)) {
  console.error("Usage: node scripts/create-ui-page.mjs <route-name> [arabicTitle] [englishTitle]");
  process.exit(1);
}

const segment = route.replace(/^\/+|\/+$/g, "");
const pageDir = join(ROOT, "app/(app)", segment);
const componentsDir = join(pageDir, "components");

if (existsSync(pageDir)) {
  console.error(`Route already exists: ${pageDir}`);
  process.exit(1);
}

mkdirSync(componentsDir, { recursive: true });

const pageTemplate = `"use client";

import { UiPageShell, UiPageHeader, UiCard } from "../../components/ui";

export default function ${toPascal(segment)}Page() {
  return (
    <UiPageShell className="p-4 md:p-6">
      <UiPageHeader title="${arabicTitle}" subtitle="${englishTitle}" />
      <UiCard>
        <p className="ui-text-muted text-sm">TODO: page content</p>
      </UiCard>
    </UiPageShell>
  );
}
`;

const loadingTemplate = `import { UiLoadingState } from "../../components/ui";

export default function Loading() {
  return <UiLoadingState label="جاري تحميل ${arabicTitle}..." />;
}
`;

const errorTemplate = `"use client";

import { UiErrorState } from "../../components/ui";

export default function Error({ error, reset }) {
  return (
    <UiErrorState
      title="تعذر تحميل الصفحة"
      description={error?.message || "حاول مرة أخرى"}
    />
  );
}
`;

writeFileSync(join(pageDir, "page.js"), pageTemplate);
writeFileSync(join(pageDir, "loading.js"), loadingTemplate);
writeFileSync(join(pageDir, "error.js"), errorTemplate);
writeFileSync(
  join(componentsDir, "README.md"),
  `# ${arabicTitle}\n\nPlace route-specific components here. Use \\`app/components/ui\\` primitives only.\n`
);

console.log(`Created design-system page scaffold at app/(app)/${segment}/`);
console.log("Note: routing and permissions were NOT modified automatically.");

function toPascal(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
