import { createAuth } from "../src/lib/auth";

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
}

const AUTH_PATH_PREFIX = "/api/auth";
const API_PATH_PREFIX = "/api/";

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Let auth routes pass through — they handle their own auth
  if (pathname === "/api/auth" || pathname.startsWith(AUTH_PATH_PREFIX)) {
    return context.next();
  }

  // Verify session for all other API routes
  if (pathname.startsWith(API_PATH_PREFIX)) {
    const auth = createAuth(context.env.DB);
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });

    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    // Inject the authenticated user id so downstream handlers
    // (storage, AI parser, CRUD endpoints) can scope every operation.
    context.data.userId = session.user.id;

    return context.next();
  }

  // Static assets and non-API routes pass through
  return context.next();
};
