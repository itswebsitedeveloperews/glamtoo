# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- On the first Glam Too publish, deploy both the storefront and API and create production products and categories to match the current development catalog exactly.
- Verify that every product and category image uses durable Object Storage references and loads successfully in production.

## Gotchas

- Replit Publish applies managed PostgreSQL schema changes, but production catalog data and media must still be checked explicitly. Do not declare a publish complete until product/category counts and representative images are verified in production.
- Production is not live yet, so the first publish may initialize its catalog from development. After the store goes live, compare environments first and preserve production orders, customers, payments, and live catalog changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
