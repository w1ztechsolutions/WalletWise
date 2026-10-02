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

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
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
    const body = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
