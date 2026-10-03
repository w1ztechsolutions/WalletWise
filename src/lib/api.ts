import { devLog, IS_DEV } from "./env";

const BASE_URL = "/api";

/**
 * Broadcast on `window` when any `/api/*` response comes back `401`.
 *
 * `functions/_middleware.ts` rejects every data route without a session, so a
 * 401 means "the session expired or was revoked", never "bad request".
 * `AuthGate` listens for this and tears the session down in one place instead
 * of each hook guessing at retry configuration.
 */
export const UNAUTHORIZED_EVENT = "walletwise:unauthorized";

/** Machine-readable codes mirroring `functions/lib/errors.ts`. */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL_ERROR";

interface ApiErrorPayload {
  error?: string;
  code?: ApiErrorCode;
  /** Server diagnostics; present only outside production. */
  details?: string;
}

/**
 * An `/api/*` request that came back with a non-2xx status.
 *
 * React Query needs the HTTP status to decide whether retrying is sensible, and
 * `useRetry` below uses it to refuse to retry a `4xx`. Previously the status
 * was discarded into a bare `Error`, so every failure looked identical and a
 * genuine `400` was retried three times.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Verbatim server-side diagnostic. Populated in development only. */
  readonly details?: string;

  constructor(message: string, status: number, code: ApiErrorCode, details?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function describeApiError(error: unknown, retryGuidance: string): string {
  if (error instanceof ApiError && error.status < 500) return error.message;
  return retryGuidance;
}

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Retry policy shared by every query.
 *
 * Retries only transient failures: a `4xx` is the caller's own bad input (or a
 * dead session), and replaying it just multiplies load and delays the error.
 * Network-level failures carry status `0` and are worth another attempt.
 */
export function useRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 401) return false;
    if (error.status >= 400 && error.status < 500) return false;
  }
  return failureCount < 2;
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        searchParams.set(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    credentials: "include",
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    // The body may not be JSON at all: a failure that escapes the Pages
    // Functions error contract (or a gateway/WAF page) returns HTML, and
    // `res.json()` used to reject, silently discarding the status and leaving
    // only a generic message. Read it as text and parse defensively so the real
    // status always survives.
    const raw = await res.text();
    let payload: ApiErrorPayload = {};
    try {
      payload = raw ? (JSON.parse(raw) as ApiErrorPayload) : {};
    } catch {
      payload = {};
    }

    const message = payload.error || `Request failed with status ${res.status}`;
    const code = payload.code ?? "INTERNAL_ERROR";
    const apiError = new ApiError(message, res.status, code, payload.details);

    // Development only: full request context and any server diagnostic. The
    // guard is not cosmetic — `payload.details` can carry a stack trace, so it
    // must never reach a production console (SECURITY.md §7).
    if (IS_DEV) {
      devLog(
        `[api] ${fetchOptions.method ?? "GET"} ${url} -> ${res.status} ${code}`,
        payload.details ? { details: payload.details } : undefined,
        raw && !payload.error ? { body: raw.slice(0, 500) } : undefined
      );
    }

    throw apiError;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
