import { AwsClient } from "aws4fetch"
import type { Env } from "@/types/env"
import { extensionOf, STORAGE_POLICIES, type StorageKind } from "@/lib/storagePolicy"

export { STORAGE_POLICIES, extensionOf }
export type { StorageKind }

/**
 * Server-side helpers for private R2 object storage (Phase 6.5).
 *
 * The R2 Workers binding has no signed-URL method, so WalletWise generates
 * true S3 presigned URLs with `aws4fetch` (SigV4) against the account's R2
 * S3 endpoint. Credentials are worker secrets only — never shipped to the
 * client (SECURITY.md §5, §6).
 *
 * All keys are user-scoped: `users/{userId}/{receipts|imports}/{uuid}-{name}`
 * which makes ownership checks a simple prefix comparison.
 */

/** SECURITY.md §5: signed URLs are capped at a 15-minute lifetime. */
export const SIGNED_URL_TTL_SECONDS = 900


/** Thrown when R2 presigning secrets are absent (e.g. fresh local dev). */
export class StorageConfigError extends Error {
  constructor(message = "Object storage is not configured.") {
    super(message)
    this.name = "StorageConfigError"
  }
}

interface PresignEnv {
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET_NAME?: string
}

function getCredentials(env: PresignEnv): {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
} {
  const accountId = env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim()
  const bucketName = env.R2_BUCKET_NAME?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new StorageConfigError()
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName }
}

/** Builds a user-scoped, filesystem-safe object key. */
export function buildObjectKey(userId: string, kind: StorageKind, fileName: string): string {
  const folder = kind === "receipt" ? "receipts" : "imports"
  const sanitized =
    fileName
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .slice(-80) || "file"
  return `users/${userId}/${folder}/${crypto.randomUUID()}-${sanitized}`
}

/** Basic structural sanity check before a key is ever signed or deleted. */
export function isSafeKeyFormat(key: unknown): key is string {
  if (typeof key !== "string" || !key || key.length > 512) return false
  if (key.startsWith("/") || key.includes("..") || key.includes("//")) return false
  return /^[\x20-\x7E]+$/.test(key)
}

/**
 * Ownership rule (SECURITY.md §2): a key is only ever signed for the user
 * whose `users/{userId}/` prefix it lives under, and only for the two
 * folders the app itself writes.
 */
export function isOwnedKey(key: string, userId: string): boolean {
  const prefix = `users/${userId}/`
  if (!key.startsWith(prefix)) return false
  const rest = key.slice(prefix.length)
  return rest.startsWith("receipts/") || rest.startsWith("imports/")
}

export interface UploadRequest {
  kind: StorageKind
  fileName: string
  contentType: string
  contentLength: number
}

export type UploadValidation = { ok: true; value: UploadRequest } | { ok: false; error: string }

/** Validates an `upload-url` request body against the per-kind policy. */
export function parseUploadRequest(body: unknown): UploadValidation {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." }
  }
  const { kind, fileName, contentType, contentLength } = body as Record<string, unknown>

  if (kind !== "receipt" && kind !== "import") {
    return { ok: false, error: "kind must be 'receipt' or 'import'." }
  }
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255) {
    return { ok: false, error: "A valid fileName is required." }
  }
  if (typeof contentLength !== "number" || !Number.isInteger(contentLength) || contentLength <= 0) {
    return { ok: false, error: "contentLength must be a positive integer." }
  }

  const policy = STORAGE_POLICIES[kind]
  if (contentLength > policy.maxBytes) {
    return {
      ok: false,
      error: `File exceeds the ${Math.round(policy.maxBytes / (1024 * 1024))}MB limit.`,
    }
  }

  const ext = extensionOf(fileName.trim())
  if (!policy.extensions.includes(ext)) {
    return { ok: false, error: `File type ${ext || "(none)"} is not allowed.` }
  }

  const normalizedType =
    typeof contentType === "string" ? contentType.split(";")[0].trim().toLowerCase() : ""
  if (normalizedType && !policy.mimeTypes.includes(normalizedType)) {
    return { ok: false, error: `Content type ${normalizedType} is not allowed.` }
  }

  return {
    ok: true,
    value: {
      kind,
      fileName: fileName.trim(),
      contentType: normalizedType || "application/octet-stream",
      contentLength,
    },
  }
}

/**
 * Generates a time-limited S3 presigned URL for the private R2 bucket.
 * Throws `StorageConfigError` when secrets are missing.
 */
export async function presignR2Url(
  env: PresignEnv,
  method: "GET" | "PUT" | "DELETE",
  key: string
): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucketName } = getCredentials(env)

  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  const url = new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucketName)}/${encodedKey}`
  )
  // Must be present *before* signing so it is covered by the signature;
  // aws4fetch would otherwise default to 24h (SECURITY.md caps us at 15m).
  url.searchParams.set("X-Amz-Expires", String(SIGNED_URL_TTL_SECONDS))

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  })

  const signed = await client.sign(new Request(url.toString(), { method }), {
    aws: { signQuery: true },
  })
  return signed.url
}

/** Convenience wrapper so endpoints can pass the Pages `Env` directly. */
export async function presignForEnv(
  env: Env,
  method: "GET" | "PUT" | "DELETE",
  key: string
): Promise<string> {
  return presignR2Url(env, method, key)
}

