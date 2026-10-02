/**
 * R2 upload policies shared by the client (pre-flight validation in the
 * receipt picker / Excel import) and the server (`upload-url` endpoint).
 * DOM-free so it can be imported from Pages Functions as well.
 */

export type StorageKind = "receipt" | "import"

export interface UploadPolicy {
  extensions: string[]
  mimeTypes: string[]
  maxBytes: number
}

export const STORAGE_POLICIES: Record<StorageKind, UploadPolicy> = {
  receipt: {
    extensions: [".pdf", ".png", ".jpg", ".jpeg", ".webp"],
    mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
  import: {
    extensions: [".xlsx", ".xls", ".csv"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "text/comma-separated-values",
      "application/octet-stream",
    ],
    maxBytes: 10 * 1024 * 1024, // 10 MB
  },
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".")
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : ""
}

/** Client-side pre-flight check; the server re-validates every request. */
export function validateFileForKind(kind: StorageKind, file: { name: string; size: number; type?: string }): string | null {
  const policy = STORAGE_POLICIES[kind]
  const ext = extensionOf(file.name)
  if (!policy.extensions.includes(ext)) {
    return `File type ${ext || "(none)"} is not allowed. Allowed: ${policy.extensions.join(", ")}.`
  }
  if (file.size <= 0) return "The selected file is empty."
  if (file.size > policy.maxBytes) {
    return `File exceeds the ${Math.round(policy.maxBytes / (1024 * 1024))}MB limit.`
  }
  return null
}
