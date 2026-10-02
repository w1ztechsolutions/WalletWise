# ADR 001: Cloudflare Fullstack Serverless Architecture

## Status
Accepted

## Date
2026-10-02

## Context
WalletWise was originally conceived with a Python Flask backend, Vercel deployment, and Neon PostgreSQL database. However:
1. Running Flask on Vercel serverless introduces substantial cold-start penalties (1.5s - 3s+) and connection pooling bottlenecks with serverless Postgres.
2. The user requested an optimal architecture that can run **entirely at zero cost ($0)**, with database, authentication, object storage, serverless functions, and user interface.
3. The specification requires strict per-user multi-tenancy, RLS or database-level isolation, private receipt storage with signed URLs, and AI-powered spreadsheet parsing.

## Decision
We adopted the **100% Cloudflare Developer Platform** stack:
1. **Frontend Hosting:** Cloudflare Pages running React 19 + TypeScript + Vite + Tailwind CSS + Lucide React.
2. **Edge API:** Cloudflare Pages Functions / Workers providing high-performance serverless endpoints with ~0ms cold starts globally.
3. **Database:** Cloudflare D1 (serverless distributed SQL / SQLite) paired with Drizzle ORM (`drizzle-orm/d1`) with strict `created_by_id` query scoping.
4. **Authentication:** Better Auth running on D1 + Workers via Web Crypto API with secure HTTP-only cookies, avoiding 3rd-party user limits.
5. **Private Object Storage:** Cloudflare R2 for user receipt images and imported Excel sheets, providing S3-compatible presigned URLs with **$0 egress fees**.
6. **AI Processing:** Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) for automatic Excel spreadsheet transaction and budget extraction within the 10,000 daily free neurons quota.

## Consequences

### Positive
- **Zero Hosting Costs:** All services fit completely within Cloudflare's free tiers (Pages: unlimited requests; Workers: 100k requests/day; D1: 5GB + 5M row reads/day; R2: 10GB + zero egress; Workers AI: 10k neurons/day).
- **Sub-100ms Global Latency:** Eliminates the cold-start penalty inherent to Python serverless runtimes.
- **Unified Single-Language Codebase:** TypeScript across the entire application (UI, Drizzle schemas, API functions, auth handlers).
- **Built-in Local Emulation:** Cloudflare's `wrangler` CLI supports `--local` execution for D1, R2, and Workers, allowing 100% offline development.

### Negative / Considerations
- **D1 is SQLite-dialect:** Advanced Postgres-specific extensions (like `pgvector` or complex stored procedures) are not used; standard ANSI SQL relational schemas and indexes are used instead.
- **Node.js Native C-Bindings:** Edge Workers run on V8 isolates; all packages must be pure JavaScript / TypeScript compatible with `nodejs_compat`.
