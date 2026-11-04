# WalletWise — launch and distribution drafts

Ready-to-publish copy for getting the repo in front of people. Update the numbers and
links as the project moves; do not add claims that are not visible in the repo.

Canonical links:

- Repository: https://github.com/w1ztechsolutions/WalletWise
- Live app: https://walletwise-15b.pages.dev
- Bare repo has no license yet — say "source available" rather than "open source" until
  a LICENSE file is added.

---

## 1. Show HN

**Title:** Show HN: WalletWise – personal finance app running entirely on Cloudflare

**Body:**

I built a personal finance app as a single Cloudflare project: React SPA on Pages,
API as Pages Functions, D1 for the database (Drizzle), Better Auth on D1, R2 for private
receipt storage, and Workers AI to turn messy spreadsheet exports into real rows.

The interesting part was doing it without a server. Things I had to solve:

- **Signed URLs.** The R2 Workers binding cannot presign, so uploads/downloads are SigV4
  presigned via `aws4fetch` with a 15-minute TTL, and every key is namespaced
  `users/{userId}/…` so ownership is a prefix check plus a folder check.
- **Per-user isolation as a rule, not a habit.** Every table carries `created_by_id`;
  every query filters on it; foreign ids return 404 rather than 403 so ids cannot be
  enumerated.
- **AI that does not break the app.** Spreadsheet import chunks rows to the model and
  falls back to a deterministic parser when the model is unavailable or returns garbage.
  The import never hard-fails because the AI did.
- **Budgets vs ledger.** Transfers live in their own table so moving money between
  wallets cannot double count against a budget.

There is an `audit.md` in the repo with the actual findings and severities, open ones
included (no password reset yet, no CSP/HSTS yet, rate limiting is per-isolate). I would
rather the repo show the gaps than pretend they are not there.

Happy to answer questions about D1 quirks, Better Auth on Workers, or the import pipeline.

**First comment:** the two things I would do differently next time: (1) put a WAF
rate-limiting rule in front of the auth routes from day one rather than relying on
in-isolate counters, and (2) treat documentation as part of the definition of done —
the audit trail is the most useful artefact in the repo and it was nearly an afterthought.

---

## 2. r/selfhosted

**Title:** WalletWise – self-hostable personal finance tracker on Cloudflare's free tier

**Body:**

I got tired of budgeting apps that want bank credentials, so I built one where you own
everything: one Cloudflare project, one D1 database, one private R2 bucket.

What it does: accounts/wallets, income and expense ledger, transfers between accounts,
per-category monthly budgets, date-ranged analytics, CSV/XLSX import (Workers AI cleans
the rows, with a deterministic fallback), receipt uploads to private storage, CSV export.

Self-hosting notes:

- Everything is in `wrangler.jsonc` — D1 binding, R2 binding, Workers AI binding.
- `npm run db:migrate:local` then `npm run build && npm run pages:dev` for a full local
  stack in the Workers runtime, or deploy through Pages Git integration.
- Secrets are four values: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the R2 API token
  pair. `.dev.vars.example` documents each one.
- Data deletion is real: soft delete with a recovery window, then a scheduled worker
  purges the rows and objects.

Known gaps are listed in the README and `audit.md`. Feedback on the schema and the
import pipeline especially welcome.

---

## 3. dev.to / Hashnode post outline

**Title:** Building a full-stack finance app on Cloudflare: D1, presigned R2 and Workers AI

1. The shape of the app: SPA + Pages Functions, why one file per route.
2. Auth on the edge: Better Auth with a D1 adapter, session cookies, and the one
   configuration gotcha (`advanced.cookies`, not a top-level `cookie` block).
3. Owning the data model: Drizzle + D1, migrations, and `created_by_id` everywhere.
4. Files without a server: SigV4 presigning with `aws4fetch` because the R2 binding
   cannot sign, 15-minute TTLs, and prefix-based ownership.
5. AI that fails safely: chunking spreadsheet rows to
   `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, validating model output, deterministic
   fallback.
6. What I got wrong: per-isolate rate limiting, missing security headers, a test suite
   that exits green while skipping most of itself.
7. What the audit trail looks like in practice.

End with the repo link and an invitation to review the audit.

---

## 4. Short posts (LinkedIn / X / WhatsApp groups)

Personal finance app, no bank credentials, no server: React on Cloudflare Pages, D1 for
data, R2 for receipts, Workers AI to parse the spreadsheet you export from your bank.
Everything user-scoped, everything deletable.

Source + the audit trail (including what is still broken):
https://github.com/w1ztechsolutions/WalletWise

---

## 5. Where to post, in order

1. **Show HN** — post Tuesday to Thursday, 14:00–16:00 UTC. Answer every comment in the
   first three hours; that is what keeps it on the front page.
2. **r/selfhosted** and **r/CloudFlare** — same day, different framing (ownership vs
   platform).
3. **dev.to** — the technical write-up, linking the repo.
4. **awesome-lists** — `awesome-selfhosted` (Personal Finance section) and
   `awesome-cloudflare` exist and take pull requests. Read their contribution rules
   first; both require a stable project URL, which means OPS-01 (custom domain) should
   land before submitting.
5. **LinkedIn + local developer communities** — a build story with screenshots of the
   actual UI.
6. **Re-post** the technical article after each meaningful release, not the launch post.

## 6. What to fix before launching

- **Screenshots.** The README has no images. Capture the dashboard, transactions list and
  the import preview at 1280px wide, save as `docs/assets/*.png`, and reference them from
  the README.
- **Custom domain (OPS-01).** `walletwise-15b.pages.dev` reads like a scratch preview.
  For a money app, that alone loses signups. Attach a domain first.
- **LICENSE.** Decide the licence before the first public post, because "no license"
  blocks awesome-list submissions and scares off contributors.
- **A seeded demo account.** Nothing converts like a URL where a visitor can click around
  without registering.
