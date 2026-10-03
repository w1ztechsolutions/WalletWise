# Account Deletion API and Operations

## Lifecycle

`POST /api/user/account-deletion` schedules deletion when sent
`{ "action": "schedule", "confirmation": "DELETE" }`. The server records the
request time and an exact 30-day deadline. User-scoped GET requests remain
available for the read-only recovery preview; application writes are rejected
with `403` until the user restores or the purge deadline passes.

Send `{ "action": "restore" }` to the same endpoint to restore the account.
Restoration clears the schedule only while the stored deadline is in the
future. `/api/user/me` returns `deletionRequestedAt` and
`deletionScheduledFor` for the signed-in user.

## Permanent Purge

Pages cannot run scheduled handlers, so `workers/account-purge.ts` is deployed
as the separate `walletwise-account-purge` Worker. Its hourly Cron purges only
users whose `deletionScheduledFor` has passed. It removes R2 objects below
`users/{userId}/`, then transactions, budgets, financial accounts, categories,
Better Auth sessions and credentials, verification records, and finally the
user row.

Deploy in this order after a code change:

```sh
npm run db:migrate:remote
npm run account-purge:deploy
npm run build
npx wrangler pages deploy dist --project-name walletwise --branch main --commit-dirty=true
```

The purge Worker must retain access to the same `walletwise-db` and
`walletwise-storage` resources. Verify its Cron trigger under Workers & Pages
after its first deployment.