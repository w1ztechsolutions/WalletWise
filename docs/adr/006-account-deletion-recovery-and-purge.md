# ADR-006: Account Deletion Recovery and Scheduled Purge

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** WalletWise maintainers

---

## 1. Context

Users need to delete an account while retaining a 30-day recovery period. During
that period, data may be previewed but not changed. Cloudflare Pages Functions
do not provide a scheduled event handler, so permanent deletion cannot depend
on an in-process timer or a later user request.

## 2. Decision

Store nullable `deletionRequestedAt` and `deletionScheduledFor` timestamps on
the Better Auth user row. Keep credentials and data during the recovery window,
allow owner-scoped reads, and enforce read-only mode in Pages middleware. A
dedicated hourly Cron Worker uses the shared D1 and R2 bindings to remove expired
users' objects and records, then credentials and the user row. Restoration is
an authenticated API action accepted only before the deadline.

## 3. Consequences

**Benefits**

- A scheduled account remains recoverable without copying or reconstructing
  credentials and finance records.
- Server middleware blocks mutations even if a stale client still renders an
  editing control.
- The scheduled Worker enforces cleanup independently of user traffic and
  deletes both D1 data and private R2 objects.

**Trade-offs**

- The account-purge Worker is deployed separately from Pages and must share the
  production D1 and R2 bindings.
- Hourly scheduling means physical deletion may occur up to one hour after the
  30-day deadline.
- R2 deletion must complete before the D1 batch; failed runs leave the D1 rows
  available for a later retry.

## 4. References

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Account deletion deployment and API notes](../api/account-deletion.md)