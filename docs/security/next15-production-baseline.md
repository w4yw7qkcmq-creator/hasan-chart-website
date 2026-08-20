# Next 15 Production Baseline — Final Closure Archive

**Closed:** 2026-08-20  
**Status:** STABLE — no further Next 15 / CSP changes in this program.

## Baseline

| Item | Value |
|------|-------|
| `FINAL_NEXT15_BASELINE_COMMIT` | `e4581e41f2a024ba0d1d796bdb170def49ddade2` |
| Next.js | **15.5.23** |
| Railway deploy | `53b024e2-50eb-40d4-9abb-90935d1e6b38` (2026-08-20 21:19:31 +03:00) |
| Rollback reference (pre-Next-15) | `f5c8b3d` |

## Stable CSP (`NEXT15_STABLE_CSP_BASELINE`)

Enforced production policy:

- `script-src 'self' 'unsafe-inline'` + Cloudflare Turnstile + TradingView domains
- **No** `unsafe-eval`
- **No** static SHA-256 hashes in enforced policy (hashes caused hydration block when combined with `unsafe-inline`)
- Theme boot hashes retained in strict **report-only** policy only

## Incidents Closed

- **CSP hydration incident (2026-08-20):** Enforced hash + `unsafe-inline` combination blocked Next bootstrap inline scripts. Fixed in `e4581e4`. Emergency hotfix branch preserved at `hotfix/csp-production-hydration` (`cef882b`) for Next 14-only reference.

## Future Work (not blockers)

- Next 16 migration — separate program
- Nonce-based CSP research — separate program
- Optional `frame-src` allowlist for `tradingview-widget.com` (informational console warnings only; widgets render via `s.tradingview.com`)
