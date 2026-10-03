interface PurgeEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
}

interface ExpiredAccount {
  id: string;
  email: string;
}

const PURGE_BATCH_SIZE = 25;

export async function purgeExpiredAccounts(env: PurgeEnv, now = new Date()): Promise<number> {
  const nowIso = now.toISOString();
  const expired = await env.DB
    .prepare(
      `SELECT id, email FROM "user"
       WHERE deletionScheduledFor IS NOT NULL AND deletionScheduledFor <= ?
       ORDER BY deletionScheduledFor
       LIMIT ?`
    )
    .bind(nowIso, PURGE_BATCH_SIZE)
    .all<ExpiredAccount>();

  let purged = 0;
  for (const account of expired.results ?? []) {
    await deleteUserObjects(env.STORAGE, account.id);

    await env.DB.batch([
      env.DB.prepare("DELETE FROM transactions WHERE created_by_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM budgets WHERE created_by_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM accounts WHERE created_by_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM categories WHERE created_by_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM session WHERE userId = ?").bind(account.id),
      env.DB.prepare("DELETE FROM account WHERE userId = ?").bind(account.id),
      env.DB.prepare("DELETE FROM verification WHERE identifier = ?").bind(account.email),
      env.DB
        .prepare('DELETE FROM "user" WHERE id = ? AND deletionScheduledFor <= ?')
        .bind(account.id, nowIso),
    ]);
    purged += 1;
  }

  return purged;
}

async function deleteUserObjects(storage: R2Bucket, userId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await storage.list({ prefix: `users/${userId}/`, limit: 1000, cursor });
    if (page.objects.length > 0) {
      await storage.delete(page.objects.map((object) => object.key));
    }
    if (!page.truncated) return;
    if (!page.cursor) throw new Error("R2 returned a truncated page without a cursor.");
    cursor = page.cursor;
  } while (cursor);
}

export default {
  async scheduled(_controller: ScheduledController, env: PurgeEnv): Promise<void> {
    const purged = await purgeExpiredAccounts(env);
    console.log(JSON.stringify({ event: "account_purge_complete", purged }));
  },
};