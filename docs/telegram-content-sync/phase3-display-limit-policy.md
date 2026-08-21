# Public Section Feed — Display Limit Policy (Phase 3)

## Retention (storage) vs display (reads)

| Layer | Limit | Scope |
|-------|-------|--------|
| **Telegram retention** | 100 posts per section | `telegram_content_posts` only; enforced at ingestion |
| **Manual content** | Independent | `daily_analysis` / `content_posts` — never deleted by Telegram retention |

## Public display limits (Phase 3)

| Source | Per-request fetch cap | Notes |
|--------|----------------------|--------|
| Telegram | 50 eligible published rows | `sync_status=published`, `qualification_status=eligible` |
| Manual academy/results | 50 published rows | Existing `content_posts` query |
| Manual daily analysis | 100 published rows | Existing API limit |
| **Merged feed cap** | 100 items | After chronological merge by `published_at` DESC |

Retention at 100 Telegram posts does **not** mean manual + telegram = 100. Each source is queried independently, then merged for display only.

## Cache keys & TTL

| Section | Cache key | TTL |
|---------|-----------|-----|
| daily_analysis (Telegram slice) | `public:telegram-section-feed:daily_analysis` | 30s |
| academy | `public:telegram-section-feed:academy` | 30s |
| result | `public:telegram-section-feed:result` | 30s |
| daily analysis API (merged response) | `public:daily-analysis` | 30s |

**ISR:** Academy/Results pages use `revalidate = 300` (unchanged).

**Webhook invalidation:** `revalidateTelegramSectionContent(section)` clears the section feed cache key(s) plus `public:daily-analysis` for daily_analysis. Next request repopulates via cached server read layer — no redeploy required.

## SEO / detail routing

- Telegram posts use immutable `public_slug` prefix `tg-da-`, `tg-ac-`, `tg-rs-`.
- Lookup is isolated: slug prefix routes to `telegram_content_posts`, never mixed with legacy `content_posts` slug queries.
- Canonical URLs: `/academy/tg-ac-{id}`, `/results/tg-rs-{id}`.

## Image cost

- Public reads use existing Supabase Storage public URLs only (no re-download from Telegram).
- Feed cards: first image thumbnail only; detail pages render full ordered gallery.
- Non-first images use `loading="lazy"`.
