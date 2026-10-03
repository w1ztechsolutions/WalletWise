# ADR-004: Playwright E2E Suite Targeting the Deployed Pages URL

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** WalletWise maintainers

---

## 1. Context

WalletWise had **no automated tests of any kind**. `package.json` carried
`dev`, `build`, `lint`, `preview`, `pages:dev` and the D1 migration scripts, and
nothing else. Verification was manual: run the app, click through it, look at
it.

That gap had already cost the project twice. [BUG-006](../../docs/bugsnfix/BUG-006-d1-binding-rename-regression.md)
and the currently-live
[BUG-008](../../docs/bugsnfix/2026-10-02-stale-deployment-breaks-production-auth.md)
are both **invisible to every existing quality gate**:

- `npm run build` passes, because `tsc` type-checks the *static* `Env`
  interface and never compares it to `wrangler.jsonc`'s binding names.
- `npm run lint` passes, because the bindings are not source code.
- The browser bundle loads and the sign-in screen renders perfectly, so the
  failure only appears once a request reaches D1.

Both bugs shipped to `walletwise-15b.pages.dev` and left production with
**zero working authentication**. A reviewer clicking around the deployed site
would have found this in seconds; nothing in the repo's pipeline did.

AGENT.md §3.3 also makes the navigation shell a hard requirement — a fixed
6-item bottom bar below the `sm` breakpoint, a slide-in drawer above it — and
that contract had no coverage either.

---

## 2. Decision

Adopt **Playwright** (`@playwright/test`) with a small, credential-gated suite
in `e2e/`, configured by `playwright.config.ts`.

**Target the deployed URL by default.** `baseURL` resolves to
`https://walletwise-15b.pages.dev`, overridable with `E2E_BASE_URL`:

```bash
npm run test:e2e                                        # production
E2E_BASE_URL=http://127.0.0.1:8788 npm run test:e2e     # wrangler pages dev
```

A `vite preview` server is explicitly *not* a valid target: it serves the
static bundle with no Pages Functions, no D1, and no edge middleware, so every
test that matters would be vacuous. The whole point is to exercise the
artefact that is actually serving users.

**Two projects, mirroring the two navigation components.** `desktop`
(1280×800) and `mobile` (Pixel 5) exist because `Sidebar.tsx` and
`BottomNav.tsx` are different components rendering the same `NavTab` state.
Asserting at one width leaves the mobile-first requirement untested.

**Specs are split by blast radius:**

| Spec | Writes to D1 | Runs without credentials |
| --- | --- | --- |
| `smoke.spec.ts` | no | yes |
| `auth.spec.ts` | validation only; full round trip needs an account | yes (round trip skips) |
| `navigation.spec.ts` | no | yes (signed-in block skips) |
| `app.spec.ts` | yes | no |

Anything that creates real rows calls `requireCredentials()` and **skips**
unless `E2E_EMAIL` / `E2E_PASSWORD` are set, so a contributor running
`npm run test:e2e` blind never writes junk into the production database. The
two create specs delete what they create through the UI's own confirmation
dialogs.

**Traces and screenshots on failure; video off.** Video was measured pushing
context teardown past the 60s test timeout against this remote deployment,
failing otherwise-passing specs with *"Tearing down context exceeded the test
timeout"*. Traces already replay the timeline.

**Typed as a separate project** (`tsconfig.e2e.json`, referenced from
`tsconfig.json`) using `moduleResolution: bundler`. It cannot reuse
`tsconfig.node.json`, whose `nodenext` resolution demands explicit `.js`
extensions on the specs' relative imports; and it must not join
`tsconfig.app.json`, which is the shipped browser bundle.

---

## 3. Consequences

**Pros**

- Deployment health becomes an automated assertion. The suite reproduces
  BUG-008 in seconds: the `401` envelope assertion fails on the stale bundle,
  and the auth lifecycle fails outright.
- The two-navigations requirement in AGENT.md §3.3 becomes executable rather
  than aspirational.
- Selectors bind to accessible roles, names, and titles, so most specs survive
  a Tailwind class rewrite; a genuine refactor that breaks a label fails loudly
  instead of silently rotting.
- `E2E_BASE_URL` makes the identical suite runnable against
  `wrangler pages dev`, which is how BUG-009 was proven to be independent of
  the deployment.

**Cons**

- The suite talks to a **remote** site, so it is slower and less hermetic than
  an in-process test, and it cannot run in an offline CI runner without a
  local `wrangler pages dev` target.
- Real credentials are required to exercise any authenticated view. Until a
  dedicated non-production account exists, roughly half the suite skips by
  default — the gap is deliberate, but it is a gap.
- The smoke specs assert on a documented API contract, so they will fail
  whenever the contract legitimately changes and `docs/api/README.md` has not
  been updated in the same commit. That is intended, but it is a tripwire.
