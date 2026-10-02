import type { Env } from "../../../src/types/env";
import { error, getAuthUser, json } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";
import {
  isOwnedKey,
  isSafeKeyFormat,
  presignForEnv,
  StorageConfigError,
} from "../../../src/lib/storage";

/**
 * DELETE /api/storage/object?key=users/{userId}/...
 * Deletes a private R2 object via a presigned DELETE request so the bucket
 * is always addressed through the same S3 endpoint used for uploads and
 * downloads (consistent between `wrangler pages dev` and production).
 */
export const onRequestDelete: PagesFunction<Env> = withErrorHandling(async (context) => {
  const injected = typeof context.data.userId === "string" ? context.data.userId : "";
  const userId = injected || (await getAuthUser(context.env, context.request))?.id;
  if (!userId) return error("Unauthorized", 401);

  const key = new URL(context.request.url).searchParams.get("key");
  if (!isSafeKeyFormat(key)) return error("A valid object key is required.");
  if (!isOwnedKey(key, userId)) return error("Not found", 404);

  try {
    const deleteUrl = await presignForEnv(context.env, "DELETE", key);
    const res = await fetch(deleteUrl, { method: "DELETE" });
    // 204 = deleted, 404 = already gone (treat as success so retries are safe)
    if (res.status === 204 || res.status === 404) {
      return json({ success: true, key });
    }
    console.error(`R2 DELETE returned ${res.status} for owned key`);
    return error("Unable to delete the file. Please try again.", 502);
  } catch (err) {
    if (err instanceof StorageConfigError) {
      console.error("R2 presigning is not configured (missing R2_* secrets):", err.message);
      return error("File storage is not configured.", 503);
    }
    console.error("Failed to delete object:", err);
    return error("Unable to delete the file. Please try again.", 500);
  }
});
