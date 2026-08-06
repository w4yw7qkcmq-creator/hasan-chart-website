# HasaN CharT World — Design System

Central UI tokens and components live under:

- `app/design-system/design-system-theme.css` — CSS tokens + shell classes
- `app/components/ui/` — React primitives (`UiButton`, `UiPageShell`, …)
- `app/components/ui/ui-theme.js` — semantic class bundles + guard patterns

## Theme contract

- Dark defaults on `:root`
- Light overrides on `html[data-theme="light"]`
- No `dark:` Tailwind classes in new UI
- Portals inherit tokens from `:root`

## New pages

```bash
node scripts/create-ui-page.mjs my-feature "العنوان" "English Title"
```

Generated pages use `UiPageShell`, `UiPageHeader`, `UiCard` only.

## Enforcement

```bash
npm run test:design-system
```

Legacy paths are listed in `scripts/design-system-legacy-allowlist.json`.

## Crystal sidebar brand

Brand card styling remains on `.site-sidebar-brand-*` classes in `app/globals.css`.
Do not use `[class*="sidebar"]` selectors.
