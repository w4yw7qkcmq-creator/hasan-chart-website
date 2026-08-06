# Phase 1 Foundation — Closure Notes

## Delivered

- Global theme tokens in `app/globals.css` (`:root` + `html[data-theme="light"]`)
- Order Book semantic layer (`order-book-theme.css`, `order-book-theme.js`, `order-book-ui.js`)
- Header/sidebar brand contracts (`.site-sidebar-brand-*`, `.site-top-header`)
- Static guards: `test-global-header-theme.js`, `test-order-book-theme.js`

## Phase 2 additions (this branch)

- Shared UI package: `app/components/ui/*`
- Design system CSS: `app/design-system/design-system-theme.css`
- Shell semantic classes: `.site-shell-root`, `.site-sidebar-panel`, `.site-main-shell`
- Enforcement: `scripts/test-design-system.js` + legacy allowlist
- Generator: `scripts/create-ui-page.mjs`

## Open (non-blocking)

- Full migration of legacy pages off hardcoded Tailwind colors
- Admin/financial page-specific visual tokens

## P0/P1/P2/P3

- P0: none open
- P1: none open
- P2: legacy page color migration (allowlisted)
- P3: Storybook/demo canvas (optional)
