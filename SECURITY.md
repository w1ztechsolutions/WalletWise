# SECURITY.md — Security Policy & Guidelines

This document specifies the mandatory security architecture, protocols, and developer guidelines for **WalletWise**. These rules are strictly enforced across all codebases, endpoints, and database interactions.

---

## 1. Authentication & Session Management

1. **Standardized Auth Provider:**
   - Use managed authentication (Better Auth running on Cloudflare D1 with Web Crypto API).
   - Never build roll-your-own password hashing or homegrown authentication loops.
   - Support standard email/password with secure verification and OAuth social providers.

2. **Zero Client-Side Token Storage:**
   - **Never** store access tokens, refresh tokens, or passwords in browser `localStorage`, `sessionStorage`, or JavaScript global variables.
   - All sessions are managed strictly via **HTTP-only, Secure, SameSite=Lax** cookies.
   - Client-side code queries session status exclusively through the `/api/auth/session` endpoint.

---

## 2. Multi-User Isolation & Data Segregation

1. **Mandatory User-Scoping on All Queries:**
   - Every single entity in the database (`categories`, `transactions`, `budgets`, `accounts`) carries a `created_by_id` column linked to the authenticated user's ID.
   - No query may EVER execute without an explicit filter: `WHERE created_by_id = :authenticated_user_id`.
   - Any query attempting to update or delete a record must verify ownership:
     ```sql
     UPDATE transactions SET ... WHERE id = :id AND created_by_id = :authenticated_user_id;
     ```
   - Returning `404 Not Found` (rather than `403 Forbidden`) when an entity does not belong to the user prevents account enumeration.

2. **Client-Side Cache Isolation:**
   - TanStack React Query cache keys must explicitly include the authenticated user ID (e.g. `['transactions', userId, filters]`).
   - On user logout or session switch, the entire React Query cache must be cleared immediately via `queryClient.clear()`.

---

## 3. Database Security & Injection Prevention

1. **Parameterized Queries Only:**
   - Use Drizzle ORM prepared statements for all database interactions.
   - Never construct raw SQL via string concatenation or template literals containing user inputs.

2. **Row-Level Security & Schema Constraints:**
   - D1 / SQLite foreign key constraints are enforced.
   - Enforce database-level uniqueness constraints (e.g., `UNIQUE(created_by_id, month, category_id)` on budgets).

---

## 4. Input Validation & Data Sanitization

1. **Server-Side Validation:**
   - Every API endpoint must validate incoming request payloads before executing database operations:
     - **Amounts:** Must be strictly positive numbers (`amount > 0`).
     - **Dates:** Must be valid ISO dates (`YYYY-MM-DD`).
     - **Account Numbers:** Must be masked. Store **only** the last 4 digits (e.g. `•••• 4821`). Never store full 16-digit card or account numbers.
     - **Strings / Notes:** Trimmed and length-capped.

---

## 5. Private Storage & Object Uploads (Cloudflare R2)

1. **No Public Storage for User Data:**
   - Cloudflare R2 buckets storing receipts, bank statements, or Excel files must be strictly private.
   - Direct public access to the bucket is disabled.

2. **Time-Limited Signed URLs:**
   - File downloads and uploads must use cryptographically signed, short-lived presigned URLs (maximum 15-minute expiration).
   - Only the user who uploaded a file may generate a signed URL to read it.

---

## 6. Secrets Management

1. **No Secrets in Frontend:**
   - Secrets, API keys, database credentials, and service tokens must reside exclusively in Cloudflare Worker environment variables or Wrangler secrets.
   - Client code (`src/`) must never reference private keys.

---

## 7. Error Handling & Information Leakage

1. **Sanitized User Errors:**
   - The UI must display friendly, generic error messages (e.g., *"Unable to save transaction. Please check your connection."*).
   - Database errors, stack traces, and internal server paths must **never** be exposed in API HTTP responses.
   - Full diagnostic logs are retained server-side in Cloudflare Worker logs only.

---

## 8. Reporting Security Issues

To report a vulnerability or security flaw, please contact:
- **Email:** `wiztechsol.info@gmail.com`
- Please provide reproduction steps and allow reasonable time for remediation before disclosure.
