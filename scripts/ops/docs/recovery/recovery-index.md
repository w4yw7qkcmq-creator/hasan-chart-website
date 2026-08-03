# Recovery Playbooks Index

| Playbook | Scenario |
|---|---|
| [full-rollback.md](./full-rollback.md) | Bad deploy — revert Railway |
| [database-recovery.md](./database-recovery.md) | Supabase/DB issues |
| [worker-recovery.md](./worker-recovery.md) | Worker crash loop |
| [market-data-recovery.md](./market-data-recovery.md) | Order book / SSE down |

## Post-recovery
1. `npm run smoke:production`
2. `npm run ops:generate`
3. Confirm Release Gate GO
