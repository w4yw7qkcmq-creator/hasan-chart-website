# Economic Fast-Lane Artwork — Channel Identity

## Brand identity

- **brandIdentity:** `ECONOMIC_NEWS_CHANNEL`
- **English label:** Economic News Channel
- **Arabic label:** الأخبار الاقتصادية

This artwork set represents an **independent professional economic-news channel**.

It is **NOT**:

- HasaN CharT World website branding
- HasaN CharT Academy branding
- HasaN Trading branding

Live release numbers remain in Telegram text only. Images are reusable category artwork.

## Technical specification

| Field | Value |
|-------|-------|
| Format | JPG |
| Orientation | Square |
| Recommended dimensions | 1080 × 1080 |
| Target file size | ~100–300 KB where practical |
| Optimized for | Telegram / mobile |
| Selection | Local filesystem lookup (near-instant) |

## Filename convention

Use zero-padded numeric filenames inside each category folder:

```
01.jpg
02.jpg
03.jpg
...
```

Example:

```
public/news/economic-fast-lane/fed/01.jpg
public/news/economic-fast-lane/cpi/01.jpg
```

## Artwork safety rules

Images must **NOT** contain:

- Actual economic results
- Previous / forecast / actual values
- Economic numbers of any kind
- Release date or release time
- Dynamically changing information
- Source Telegram channel branding
- ForexBreakingNews / ForexNewspaper
- Third-party Telegram URLs

## Prototype assets (first two only)

| Category | Path | Concept | Status |
|----------|------|---------|--------|
| fed | `fed/01.jpg` | Federal Reserve / US interest-rate decision | Pending artwork |
| cpi | `cpi/01.jpg` | US CPI / inflation | Pending artwork |

## Full manifest (50 images)

See `worker/lib/news-images/economic-fast-lane-artwork-manifest.js` for the authoritative manifest and category counts.

Validation:

```bash
node worker/tests/economic-fast-lane-artwork-manifest.test.cjs
```
