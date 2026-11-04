# ADR-007: CI Quality Gates and the Branch + PR Delivery Flow

- **Status:** Accepted (2026-11-04)
- **Date:** 2026-11-04
- **Supersedes:** nothing
- **Related:** `audit.md` v4 (OPS-02), `docs/adr/004-playwright-e2e-suite-against-deployed-pages.md`

## Context

`main` is wired to Cloudflare Pages: every push is built and published to users. Until
this change the repository had **zero** GitHub Actions workflows and zero runs
(`GET /repos/w1ztechsolutions/WalletWise/actions/workflows` → `total_count: 0`), so a
commit reached production with no type check, no lint, no build and no test in
between. The only pre-flight checks that existed were the ones a developer or agent
happened to run by hand.

Two facts framed the decision:

1. **`main` is now protected** (force-push blocked, branch deletion blocked,
   conversation resolution required) but a protected branch with no required status
   checks gates nothing, because there is no check to require.
2. **A push-time workflow cannot gate deployment.** Cloudflare Pages builds on
   `push`, not on GitHub check status. A workflow that only runs *after* the push can
   tell us production broke, but it cannot stop it. Real gating requires the deploy
   commit to be a merge commit produced after checks pass.

The credential-free Playwright smoke suite already existed and passes against the
deployed origin (5 specs, ~4s), so a meaningful gate was cheap to add rather than
something to invent.

## Decision

1. Add `.github/workflows/ci.yml` with two jobs:
   - **quality** — `npm ci`, `npx tsc -b`, `npm run lint`, `npx vite build`, dist
     uploaded as an artefact. Runs on `push` to `main`, on `pull_request` to `main`,
     and on `workflow_dispatch`.
   - **e2e-smoke** — `npx playwright install --with-deps chromium`, then
     `npx playwright test e2e/smoke.spec.ts --project=desktop` against
     `vars.E2E_BASE_URL` (default `https://walletwise-15b.pages.dev`). Only the
     credential-free smoke spec runs: the credentialed specs write to D1 and stay
     opt-in.
2. Adopt a **branch + PR flow** for changes to `main`. The agent or developer pushes
   a topic branch, opens a PR, CI runs, and the owner reviews and merges. Merging is
   the deploy trigger.
3. Require the `quality` job on `main` **after** this workflow lands on `main`
   (a required check that no workflow reports would block every PR, including this
   one).

## Consequences

**Positive**

- No commit reaches users without passing type check, lint and build, plus a live
  API-contract smoke run.
- Every change gets a reviewable diff, a CI verdict and a revert target — the audit
  trail the AGENT.md governance model assumes.
- The owner's approval step is enforced by GitHub rather than by convention.
- `e2e-smoke` fails loudly if production starts returning non-sanitized errors or
  loses the 401 envelope, which is exactly the regression the smoke spec guards.

**Negative / accepted trade-offs**

- Slower loop: a one-line docs fix now waits for a PR and a run. Accepted, because
  the alternative is unreviewed code shipping to a finance app.
- `e2e-smoke` tests the **deployed** origin, not the PR's build. A PR that breaks
  the API contract is caught only after merge, by the post-merge run plus the smoke
  suite. Testing a PR preview would require the Cloudflare preview-URL API and a
  token in CI; deliberately deferred, and noted here rather than left implicit.
- CI adds a Node toolchain that must be kept in step by hand. Node is pinned in
  `.nvmrc` (read by `actions/setup-node`), mirrored by `engines.node` in
  `package.json`, and must also be set as the Cloudflare Pages build variable
  `NODE_VERSION`; three places to change, one of them outside the repo. The pin
  exists because a silent runtime skew between CI and the deploy host is worse
  than the maintenance cost.
- GitHub Actions minutes are consumed on a public repo (free tier for public repos).

## Alternatives considered

- **Keep pushing directly to `main`, run CI only as a post-deploy alarm.** Rejected:
  it detects breakage after users already have the build, and it leaves the owner's
  approval step unenforced.
- **Gate with a Cloudflare Pages deploy hook triggered by a successful workflow.**
  Rejected for now: it requires moving away from the existing Git integration,
  creates a second source of truth for deploys, and needs a Cloudflare API token in
  GitHub secrets.
- **Add branch protection requiring PRs for administrators as well.** Rejected:
  `enforce_admins` stays `false` so the owner retains a break-glass path; the PR
  flow is enforced by the required check instead.

## Follow-up work

- After merge: enable the required status check on `main` and verify a deliberately
  failing branch cannot merge.
- Set the Pages project's `NODE_VERSION` build variable to the `.nvmrc` major so the
  deploy stops relying on the host default, then bump all three pins together on the
  next LTS (Node 28, October 2027).
- Add a `preview` job once a Cloudflare API token is available, so PRs are smoke-tested
  against their own Pages preview deployment.
- Revisit credential-backed e2e in CI (OPS/TEST work order item, `audit.md` DOC-06).
