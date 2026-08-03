# Migration Verification Checklist

Manual step — referenced by deployment verification.

- [ ] Migration file reviewed in `supabase/migrations/`
- [ ] Applied to staging: `supabase db push` (or CI migration job)
- [ ] RLS policies verified — no accidental lockout
- [ ] Worker compatibility — no breaking column renames without code deploy
- [ ] Rollback migration documented (if reversible)
- [ ] Smoke auth + subscription + admin pass post-migration
- [ ] Production migration scheduled in maintenance window

Status in `deployment-verification.json` → `migration-verified: manual`
