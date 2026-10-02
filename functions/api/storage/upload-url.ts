import type { Env } from "../../../src/types/env";
import { error, getAuthUser, json } from "../../lib/helpers";
import { withErrorHandling } from "../../lib/errors";
import {
  buildObjectKey,
  parseUploadRequest,
  presignForEnv,
  SIGNED_URL_TTL_SECONDS,
  StorageConfigError,
} from "../../../src/lib/storage";

/**
 * POST /api/storage/upload-url
 * Issues a 15-minute presigned PUT URL for a private, user-scoped R2 key.
 */
export const onRequestPost: PagesFunction<Env> = withErrorHandling(async (context) => {
  const injected = typeof context.data.userId === "string" ? context.data.userId : "";
  const userId = injected || (await getAuthUser(context.env, context.request))?.id;
  if (!userId) return error("Unauthorized", 401);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return error("Invalid JSON body");
  }

  const validation = parseUploadRequest(body);
  if (!validation.ok) return error(validation.error);

  const key = buildObjectKey(userId, validation.value.kind, validation.value.fileName);

  try {
    const uploadUrl = await presignForEnv(context.env, "PUT", key);
    return json({
      uploadUrl,
      key,
      method: "PUT",
      contentType: validation.value.contentType,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    if (err instanceof StorageConfigError) {
      console.error("R2 presigning is not configured (missing R2_* secrets):", err.message);
      return error("File storage is not configured.", 503);
    }
    console.error("Failed to issue upload URL:", err);
    return error("Unable to prepare upload. Please try again.", 500);
  }
});
