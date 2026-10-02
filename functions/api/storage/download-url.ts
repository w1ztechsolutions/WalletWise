import type { Env } from "../../../src/types/env";
import { error, getAuthUser, json } from "../../lib/helpers";
import {
  isOwnedKey,
  isSafeKeyFormat,
  presignForEnv,
  SIGNED_URL_TTL_SECONDS,
  StorageConfigError,
} from "../../../src/lib/storage";

/**
 * GET /api/storage/download-url?key=users/{userId}/...
 * Issues a 15-minute presigned GET URL. Ownership (and folder scope) is
 * enforced server-side: foreign keys return 404, never 403 (SECURITY.md §2).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const injected = typeof context.data.userId === "string" ? context.data.userId : "";
  const userId = injected || (await getAuthUser(context.env, context.request))?.id;
  if (!userId) return error("Unauthorized", 401);

  const key = new URL(context.request.url).searchParams.get("key");
  if (!isSafeKeyFormat(key)) return error("A valid object key is required.");
  if (!isOwnedKey(key, userId)) return error("Not found", 404);

  try {
    const downloadUrl = await presignForEnv(context.env, "GET", key);
    return json({ downloadUrl, key, expiresIn: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    if (err instanceof StorageConfigError) {
      console.error("R2 presigning is not configured (missing R2_* secrets):", err.message);
      return error("File storage is not configured.", 503);
    }
    console.error("Failed to issue download URL:", err);
    return error("Unable to prepare download. Please try again.", 500);
  }
};
