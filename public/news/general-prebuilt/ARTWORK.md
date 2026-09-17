# Economic Newsi — General News Prebuilt Artwork (V2)

## Brand identity

- **brandIdentity:** `ECONOMIC_NEWSI`
- **English label:** Economic Newsi
- **Badge:** EN

This library is **independent** from the structured numeric Economic Fast-Lane pool (`public/news/economic-fast-lane/`).

## Purpose

Fifty reusable 1080×1080 backgrounds for general economic and geopolitical Telegram posts (Iran/US, oil, gold, FX, Fed commentary, shipping, China, equities sentiment, crypto, and fallbacks).

AI generates **background only**. All typography and branding are applied locally (SVG + sharp).

## Technical specification

| Field | Value |
|-------|-------|
| Format | JPG |
| Orientation | Square |
| Dimensions | 1080 × 1080 |
| Target file size | ~100–300 KB where practical |
| Optimized for | Telegram / mobile |

## Directory layout

```
public/news/general-prebuilt/
  iran-us/
  oil-up/
  oil-down/
  gold/
  usd/
  us-economy/
  fed-general/
  geopolitics/
  hormuz-shipping/
  china-markets/
  global-markets-up/
  global-markets-down/
  crypto/
  breaking-economic/
```

Future worker mirror (Phase 2+): `worker/public/news/general-prebuilt/` — byte-identical copies after generation.

## Manifest

Authoritative manifest: `worker/lib/news-images/general-prebuilt-artwork-manifest.js`

Scene prompts and overlay titles: `worker/lib/news-images/general-prebuilt-artwork-prompts.js`

Routing design (not live): `worker/lib/news-images/general-news-artwork-router.js`

## Validation

```bash
node worker/tests/general-prebuilt-artwork-manifest.test.cjs
node worker/tests/general-news-artwork-router.test.cjs
```

## Offline generation (Phase 2+)

```bash
node scripts/generate-general-prebuilt-artwork.js --dry-run
ALLOW_GENERAL_PREBUILT_ARTWORK_GENERATION=1 node scripts/generate-general-prebuilt-artwork.js
```
