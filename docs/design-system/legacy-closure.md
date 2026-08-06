# Design System — Legacy CSS Closure

## Removed selectors (globals.css)

| Removed | Replacement |
|---|---|
| `[class*="price"]`, `[class*="Price"]` | `.site-price-card--tv`, `.site-price-card--pulse` |
| `[class*="market"]`, `[class*="Market"]` | `.site-market-pulse-panel` |
| `[class*="sidebar"]` | `.site-sidebar-panel`, `.site-mobile-drawer-panel` |
| `:has(.tradingview-widget-container)` | `.ui-tradingview-shell` |
| `:has(.badgeBlue/.badgeGreen)` | `.ui-badge-panel` |
| `aside:has(.menuItem)` etc. | `.site-sidebar-panel` / `.site-mobile-drawer-panel` |

## Remaining allowlist

See `scripts/design-system-legacy-allowlist.json` — each entry has `file`, `reason`, `owner`, `removeWhen`.

## Rule: touch legacy → no new legacy styling

If you edit an allowlisted file, added lines must not introduce:

- `bg-white`, `text-black`, `dark:*`
- hex colors in JSX
- `[class*="..."]` or `:has(...)` in CSS
- native `<select>` outside `app/components/ui`

`scripts/test-design-system.js` enforces this on git diff hunks.

## Migrating a legacy page

1. Replace surfaces with `ui-surface`, `UiCard`, or semantic page classes.
2. Replace buttons/inputs with `UiButton`, `UiInput`, `UiSelect`.
3. Remove path from allowlist only after `npm run test:design-system` passes without exemption.
4. Do not add global CSS overrides — add explicit semantic class to JSX.
