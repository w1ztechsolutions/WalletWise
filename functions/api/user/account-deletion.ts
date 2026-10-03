import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { user } from "../../../src/db/schema";
import { error, getAuthUser, json } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT?: string;
}

const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const onRequestPost: PagesFunction<Env> = withErrorHandling(async (context) => {
  const authUser = await getAuthUser(context.env, context.request);
  if (!authUser) return error("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const db = drizzle(context.env.DB);
  const now = new Date();
  const nowIso = now.toISOString();

  if (body.action === "schedule") {
    if (body.confirmation !== "DELETE") {
      return error('Type "DELETE" to confirm account deletion.');
    }

    const scheduledFor = new Date(now.getTime() + RECOVERY_WINDOW_MS).toISOString();
    const [updated] = await db
      .update(user)
      .set({ deletionRequestedAt: nowIso, deletionScheduledFor: scheduledFor })
      .where(and(eq(user.id, authUser.id), isNull(user.deletionScheduledFor)))
      .returning({ deletionRequestedAt: user.deletionRequestedAt, deletionScheduledFor: user.deletionScheduledFor });

    if (!updated) return error("Account deletion is already scheduled.", 409);
    return json(updated);
  }

  if (body.action === "restore") {
    const [updated] = await db
      .update(user)
      .set({ deletionRequestedAt: null, deletionScheduledFor: null })
      .where(
        and(
          eq(user.id, authUser.id),
          isNotNull(user.deletionScheduledFor),
          gt(user.deletionScheduledFor, nowIso)
        )
      )
      .returning({ deletionRequestedAt: user.deletionRequestedAt, deletionScheduledFor: user.deletionScheduledFor });

    if (updated) return json(updated);

    const [current] = await db
      .select({ deletionScheduledFor: user.deletionScheduledFor })
      .from(user)
      .where(eq(user.id, authUser.id))
      .limit(1);
    if (!current?.deletionScheduledFor) return error("Account deletion is not scheduled.", 409);
    return error("The 30-day recovery period has ended.", 410);
  }

  return error("Action must be 'schedule' or 'restore'.");
});