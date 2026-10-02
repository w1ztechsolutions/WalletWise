# AGENT.md — Developer & AI Operating Directives

This document sets the mandatory operational, architectural, and documentation protocols for any AI agent or developer building and maintaining **WalletWise**.

---

## 1. Core Principles & Governance

1. **Follow `PLAN.md` Rigorously:**
   - All tasks must be executed against the phases defined in [PLAN.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/PLAN.md).
   - Check off completed steps in [PLAN.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/PLAN.md) as work advances.
   - Do not deviate from the core architecture without creating an ADR.

2. **Security Compliance is Mandatory:**
   - Every file, endpoint, and query must comply strictly with [SECURITY.md](file:///c:/Users/WIZTECH%20SOLUTIONS/Desktop/Projects/WalletWise/SECURITY.md).
   - Never compromise on per-user data isolation. Every database query that accesses user data must strictly filter by `created_by_id`.

3. **No Placeholders or Mocks in Production Code:**
   - All features, dialogs, buttons, and endpoints must be functional.
   - Never use stubbed dummy data when the database or state is connected.
   - Implement complete empty states for new users.

---

## 2. Mandatory Documentation Protocol

All documentation files (other than the root governance files `AGENT.md`, `PLAN.md`, `SECURITY.md`, and `README.md`) **MUST** be placed in the `docs/` directory:

```text
docs/
├── adr/                       # Architectural Decision Records
│   ├── 001-cloudflare-fullstack-architecture.md
│   └── ...
├── bugsnfix/                  # Bug logs, post-mortems, and fixes
│   ├── README.md
│   └── ...
└── api/                       # API documentation and schema references
```

### Architectural Decision Records (`docs/adr/`)
Whenever a significant architectural, framework, or structural decision is made:
- Create a new file: `docs/adr/XXX-title.md` (e.g. `001-cloudflare-fullstack-architecture.md`).
- Must include:
  1. **Status:** Proposed / Accepted / Superseded
  2. **Context:** What problem or requirement triggered the decision?
  3. **Decision:** What was chosen?
  4. **Consequences:** What are the pros, cons, and trade-offs?

### Bug & Fix Tracking (`docs/bugsnfix/`)
Whenever a non-trivial bug, build failure, migration error, or security flaw is identified and fixed:
- Document it in `docs/bugsnfix/YYYY-MM-DD-short-description.md` or append to the bug tracker log.
- Must document:
  1. **Symptoms & Error Messages**
  2. **Root Cause Analysis**
  3. **Resolution / Code Changes**
  4. **Prevention Strategy**

---

## 3. Technology & Coding Standards

1. **Frontend:**
   - React with TypeScript and Vite.
   - Tailwind CSS for all styling (use design tokens, zero arbitrary unmanaged colors).
   - Inter font from Google Fonts.
   - Icons: Use `lucide-react` exclusively.
   - Components: Follow accessible, clean `shadcn/ui` patterns.

2. **Backend & Cloudflare Edge:**
   - Cloudflare Pages Functions / Workers.
   - Drizzle ORM connecting to Cloudflare D1 (`drizzle-orm/d1`).
   - Better Auth for multi-user authentication with secure HTTP-only cookies.
   - Cloudflare R2 for private receipt and Excel file storage with presigned URLs.
   - Cloudflare Workers AI for spreadsheet parsing.

3. **Mobile-First Layout:**
   - Screen widths below tablet breakpoint: **Fixed bottom navigation bar** with 6 items, active color, and content padding.
   - Tablet & desktop: Slide-in navigation drawer with backdrop overlay.

4. **Git & Commit Hygiene:**
   - Commit logically after completing functional sub-tasks.
   - Keep `.gitignore` comprehensive: never commit `.env`, `node_modules`, `.wrangler`, or build artifacts.
