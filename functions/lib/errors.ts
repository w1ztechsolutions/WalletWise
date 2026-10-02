/**
 * Typed API error contract with environment-aware serialization.
 *
 * WalletWise runs the same code in two very different places: `wrangler pages
 * dev` on a developer laptop, and the Cloudflare edge in production. Those two
 * environments must NOT report failures identically — SECURITY.md §7 forbids
 * leaking database errors, stack traces or internal paths into HTTP responses,
 * while a developer staring at a broken dev server needs the exact opposite.
 *
 * That split lives here, in one module, so no individual endpoint has to
 * remember it:
 *
 *  - `ApiError` carries a safe `message` (shown in every environment) plus an
 *    optional `details` field holding the real diagnostic (stack, D1 text).
 *  - `toResponse()` sends `details` **only** when the runtime is not
 *    production. In production the caller gets the sanitized message and the
 *    full diagnostic is written to the Worker log instead.
 *
 * `isProduction()` deliberately fails *closed*: only the exact string
 * "development" unlocks verbose output. A missing or misspelled
 * `ENVIRONMENT` binding therefore behaves like production, so forgetting the
 * var can never leak internals to end users (SECURITY.md §7).
 */

/** Stable, machine-readable codes. Safe to switch on in client code. */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL_ERROR";

/** Generic copy shown to users for each 5xx, regardless of the real cause. */
const GENERIC_SERVER_MESSAGE = "Something went wrong. Please try again.";

interface ErrorEnvelope {
  error: string;
  code: ErrorCode;
  /** Present only outside production. */
  details?: string;
}

/** Infers a sensible machine code from an HTTP status. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 429:
      return "RATE_LIMITED";
    case 502:
    case 503:
    case 504:
      return "UNAVAILABLE";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}
/**
 * An error the API is willing to describe.
 *
 * Throwing one of these is the supported way for a handler to fail with a
 * deliberate status; anything else that escapes a handler is treated as an
 * unexpected bug and reported as a generic 500.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: string;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 500;
    this.code = options.code ?? codeForStatus(this.status);
    this.details = options.details;
  }

  /**
   * Builds an `ApiError` from a status, deriving both code and message. Used
   * by the legacy `error(message, status)` helper so all 29 existing call
   * sites keep their current, already-sanitized copy.
   */
  static fromStatus(status: number, message: string): ApiError {
    return new ApiError(message, { status, code: codeForStatus(status) });
  }

  /**
   * Serializes to an HTTP response.
   *
   * `env` is optional so pure helpers (`error()` in `helpers.ts`) can respond
   * without a binding; omitting it means production-safe output, since
   * `isProduction()` fails closed.
   */
  toResponse(env?: { ENVIRONMENT?: string }): Response {
    const body: ErrorEnvelope = { error: this.message, code: this.code };

    if (this.details && !isProduction(env)) {
      body.details = this.details;
    }

    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
}

/**
 * True unless the runtime explicitly declares itself a development
 * environment. Defaults to `true` (production) when `ENVIRONMENT` is absent —
 * see the fail-closed note at the top of this module.
 */
export function isProduction(env?: { ENVIRONMENT?: string }): boolean {
  return env?.ENVIRONMENT?.trim().toLowerCase() !== "development";
}


export interface ApiErrorOptions {
  status?: number;
  code?: ErrorCode;
  /**
   * The diagnostic detail (stack trace, D1 error text, upstream body). It is
   * dropped from production responses and logged instead.
   */
  details?: string;
}

/** Structured log line; readable in both `wrangler tail` and the dev console. */
export interface ErrorContext {
  method?: string;
  path?: string;
  requestId?: string;
}

/**
 * Single entry point for everything that escapes a handler.
 *
 * Logs the complete diagnostic in *every* environment — Worker logs are
 * server-side and SECURITY.md §7 explicitly wants full diagnostics retained
 * there — but only returns `details` to the caller outside production.
 */
export function handleUnexpectedError(
  err: unknown,
  env: { ENVIRONMENT?: string } | undefined,
  context: ErrorContext = {}
): Response {
  const production = isProduction(env);

  // A deliberate ApiError keeps its own status/message; only its `details`
  // gets stripped in production.
  if (err instanceof ApiError) {
    logError(err, context, "api_error");
    return err.toResponse(env);
  }

  const isError = err instanceof Error;
  const name = isError ? err.name : typeof err;
  const message = isError ? err.message : String(err);
  const stack = isError ? err.stack : undefined;

  const apiError = new ApiError(GENERIC_SERVER_MESSAGE, {
    status: 500,
    code: "INTERNAL_ERROR",
    // The real cause travels to the client only in development.
    details: production ? undefined : `${name}: ${message}${stack ? `\n${stack}` : ""}`,
  });

  logError(apiError, context, "unhandled_exception", { name, cause: message, stack });

  return apiError.toResponse(env);
}

/** Emits one structured JSON line so log queries can filter on stable keys. */
function logError(
  err: ApiError,
  context: ErrorContext,
  event: string,
  extra: Record<string, unknown> = {}
): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      code: err.code,
      status: err.status,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      ...context,
      ...extra,
    })
  );
}

/**
 * Wraps a Pages Function handler so no rejection can escape into Cloudflare's
 * opaque default error document.
 *
 * Pages Functions middleware exposes no `onError` hook, so without this a
 * thrown D1 error produces an HTML 500 page that `apiFetch` cannot parse — the
 * user sees a bare "Request failed with status 500" and nothing reaches the
 * Worker log. `functions/_middleware.ts` applies the same guard around
 * `context.next()` as a second net.
 */
export function withErrorHandling<E extends { ENVIRONMENT?: string }>(
  handler: PagesFunction<E>
): PagesFunction<E> {
  return async (context) => {
    try {
      return await handler(context);
    } catch (err) {
      return handleUnexpectedError(err, context.env, {
        method: context.request.method,
        path: new URL(context.request.url).pathname,
        requestId: typeof context.data?.requestId === "string" ? context.data.requestId : undefined,
      });
    }
  };
}
