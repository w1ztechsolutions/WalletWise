import { betterAuth } from "better-auth";
import { withCloudflare, type CloudflareGeolocation } from "better-auth-cloudflare";
import { drizzle } from "drizzle-orm/d1";

import {
  user,
  session,
  account as authAccount,
  verification,
} from "../db/schema";

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
        cookie: {
          sessionToken: {
            name: "walletwise_session",
            httpOnly: true,
          },
        },
        advanced: {
          ipAddress: {
            ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"],
          },
        },
      }
    )
  );
}
