# IAM / RBAC — Enterprise Architecture

## Feature flags (default: all off)

| Flag | Requires | Effect |
|------|----------|--------|
| `IAM_DB` | — | Read assignments from DB |
| `IAM_API` | `IAM_DB` | Enforce permissions on API |
| `IAM_UI` | `IAM_DB` | Gate admin UI by permission |
| `IAM_RLS` | `IAM_DB` + `IAM_API` | Enforce RLS via `iam_has_permission` |

## Bootstrap ceremony

Env (document only — no values in repo):

- `IAM_BOOTSTRAP_SECRET`
- `IAM_BOOTSTRAP_EXPIRES_AT`
- `IAM_BOOTSTRAP_ALLOWED_IPS`
- `IAM_OWNER_EMAIL` (backfill only)

## Staging rollout

1. Apply `20260804_iam_rbac_foundation.sql`
2. Apply `20260804_iam_rls_functions.sql`
3. Bootstrap super_admin
4. Dry-run backfill: `POST /api/iam/health` `{ "action": "dry_run_backfill" }`
5. Enable `IAM_DB` only → verify
6. Enable `IAM_API` → verify permission denials
7. Enable `IAM_UI` → verify nav gating
8. Apply dual RLS policies → enable `IAM_RLS`

## Runbooks

See `docs/iam/runbooks/` for lockout, bootstrap failure, audit writer failure, and RLS rollback.
