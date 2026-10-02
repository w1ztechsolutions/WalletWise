import { betterAuth } from "better-auth";
import { withCloudflare, type CloudflareGeolocation } from "better-auth-cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import {
  user,
  session,
  account as authAccount,
  verification,
  categories,
} from "../db/schema";
import { DEFAULT_CATEGORIES } from "./defaultCategories";

/**
 * @param cf Optional Cloudflare request context (`request.cf`) used by
 *   better-auth-cloudflare for session geolocation/IP detection. The library
 *   REQUIRES a truthy value even when tracking data is unavailable, so we
 *   default to an empty (all-optional) object instead of failing every
 *   request with "Cloudflare context is required".
 */
export function createAuth(db: D1Database, cf?: CloudflareGeolocation) {
  const drizzleDb = drizzle(db);

  return betterAuth(
    withCloudflare(
      {
        cf: cf ?? {},
        // The WalletWise `session` table (src/db/schema.ts) does not carry
        // the optional geolocation columns (city/country/colo/...) that
        // better-auth-cloudflare adds when tracking is enabled, so session
        // geolocation tracking is disabled; IP detection still works via
        // the `cf-connecting-ip` headers configured below.
        geolocationTracking: false,
        d1: {
          db: drizzleDb,
          options: {
            schema: {
              user,
              session,
              account: authAccount,
              verification,
            },
          },
        },
      },
      {
        emailAndPassword: {
          enabled: true,
        },
        session: {
          storeSessionInDatabase: true,
          expiresIn: 60 * 60 * 24 * 7,
        },
        advanced: {
          ipAddress: {
            ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"],
          },
          /**
           * Session cookie naming lives under `advanced.cookies`, keyed by the
           * cookie's internal name (`session_token`) — a top-level `cookie`
           * block is silently ignored and leaves the cookie on Better Auth's
           * default `better-auth.session_token`.
           *
           * `httpOnly: true` is already the default; it is restated here
           * because losing it would expose the session token to script.
           */
          cookies: {
            session_token: {
              name: "walletwise_session",
              attributes: {
                httpOnly: true,
                sameSite: "lax",
                path: "/",
              },
            },
          },
        },
        databaseHooks: {
          user: {
            create: {
              /**
               * Give every new account the nine starter categories.
               *
               * Idempotent by construction: seeding only runs when the account
               * has no categories at all, so a retry — or a Better Auth internal
               * re-create — cannot produce duplicates. Failures are swallowed so
               * a seeding problem can never block the signup itself; the user
               * can still create categories by hand.
               */
              after: async (createdUser) => {
                try {
                  const db = drizzleDb;
                  const existing = await db
                    .select({ id: categories.id })
                    .from(categories)
                    .where(eq(categories.created_by_id, createdUser.id))
                    .limit(1);

                  if (existing.length > 0) return;

                  await db.insert(categories).values(
                    DEFAULT_CATEGORIES.map((seed) => ({
                      id: crypto.randomUUID(),
                      created_by_id: createdUser.id,
                      name: seed.name,
                      type: seed.type,
                      color: seed.color,
                      icon: seed.icon,
                    }))
                  );
                } catch (error) {
                  console.error("[walletwise] category seeding failed", error);
                }
              },
            },
          },
        },
      }
    )
  );
}
