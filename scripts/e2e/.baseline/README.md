# Visual regression baselines

Place approved PNG baselines here with fixed names:

- `01-home.png`
- `02-login.png`
- `03-dashboard.png`
- `05-news.png`
- `06-order-book.png`
- `07-subscription.png`
- `08-admin.png`

On first smoke run, missing baselines are **auto-created** from captured screenshots.
Review and commit baselines after intentional UI changes.

Comparison uses **pixelmatch** with ~1% diff tolerance (anti-aliasing friendly).
