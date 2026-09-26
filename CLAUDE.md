# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package manager

**Yarn 4 only** (`packageManager: yarn@4.14.1`, `nodeLinker: node-modules`). Never run `npm`/`pnpm` — a stray lockfile breaks workspace resolution. `corepack enable` pins the right Yarn version. Node >= 20.

## Commands

All cross-workspace tasks run through Turborepo from the repo root:

```bash
yarn dev         # web + api in watch mode (persistent, not cached)
yarn build       # build all workspaces (respects ^build dependency order)
yarn lint        # ESLint across workspaces
yarn typecheck   # tsc --noEmit across workspaces
yarn test        # Jest across workspaces (api uses --passWithNoTests)
yarn format      # Prettier write over the repo
```

Scope to one workspace with `yarn workspace <name> <script>`, e.g. `yarn workspace @rms/api test`, `yarn workspace @rms/web dev`. Jest has no single-test script wired; run one file/test with `yarn workspace @rms/api test -- <path> -t "<name>"`.

Database (Prisma, in `@rms/db`):

```bash
yarn workspace @rms/db generate            # regenerate Prisma client (run after schema edits)
yarn workspace @rms/db migrate:dev --name <change>   # create + apply a migration (uses root .env)
yarn workspace @rms/db migrate:deploy      # apply committed migrations (no .env wrapper)
yarn workspace @rms/db studio              # Prisma Studio
yarn workspace @rms/db validate            # validate schema against the DB
```

Docker stack (postgres + api + web):

```bash
docker compose up --build   # api runs `prisma migrate deploy` on startup via docker/entrypoint-api.sh
docker compose down -v      # stop and wipe the db volume
```

## Ports (they differ by context — easy to trip on)

- Web: **3001**, API: **3000** everywhere.
- Postgres: host **5433** → container 5432 (5432 is often already taken locally). The root `.env` / `.env.example` `DATABASE_URL` points at `localhost:5433`; inside the compose network the api reaches it at `postgres:5432`.

## Architecture

Turborepo + Yarn-workspaces monorepo. Two apps, four packages:

| Path                    | Workspace           | Role                                                           |
| ----------------------- | ------------------- | -------------------------------------------------------------- |
| `apps/api`              | `@rms/api`          | NestJS REST API                                                |
| `apps/web`              | `@rms/web`          | Next.js 15 (App Router) + React 19 + Tailwind + TanStack Query |
| `packages/api-contract` | `@rms/api-contract` | Zod schemas + inferred types (the API↔web contract)            |
| `packages/permissions`  | `@rms/permissions`  | Roles + permission policy (pure data)                          |
| `packages/shared`       | `@rms/shared`       | Framework-agnostic utilities (`Result`, pagination, strings)   |
| `packages/db`           | `@rms/db`           | Prisma schema + generated client                               |

**Dependency direction (do not violate):** `@rms/shared` and `@rms/permissions` are leaves; `@rms/api-contract` builds on them; the two apps depend on the packages, never the reverse. `@rms/shared` must stay free of any Nest/Next imports.

### Contract-first: `@rms/api-contract`

Every request/response shape is a **Zod schema** here, with TS types **inferred** (`z.infer`) — schemas are the single source of truth so client and server can't drift. The API imports schemas for validation; `apps/web` imports the same schema and calls `.parse()` on responses (see `apps/web/src/lib/api.ts`). When adding an endpoint, define its schema here first, then consume it on both sides.

### Permissions: `@rms/permissions` is the source of truth

Roles (`ADMIN/MANAGER/STAFF/CUSTOMER`) and `resource:action` permission keys live in code, mapped in `policy.ts` (`ROLE_PERMISSIONS`). Authorization guards must consult `roleHasPermission(role, permission)` — never hard-code role checks in controllers. The DB stores permission keys as strings validated against this package (there is intentionally no `permissions` table); Prisma `Role` rows are per-restaurant and seeded from these definitions on signup.

### API layering (`apps/api`)

Target layering is `Controller → Service → Repository → Prisma → PostgreSQL`, dependencies pointing inward. Rules: controllers never touch Prisma directly; repositories hold no business rules. Only the Controller layer exists so far (`status/`). Each domain is a self-contained NestJS feature module. Cross-cutting code lives in `common/` — notably `common/filters/http-exception.filter.ts`, a global filter translating every error into the standard envelope (`{ statusCode, message, error, timestamp, path }`, defined as `errorResponseSchema`). Env is validated at boot by a Zod schema in `config/env.validation.ts` (fails fast on misconfiguration). Swagger UI is served at `/api/docs`.

### Prisma schema conventions (`packages/db/prisma/schema.prisma`)

- UUID PKs (`@db.Uuid`, `@default(uuid())`); all timestamps `@db.Timestamptz(6)` (UTC).
- DB identifiers snake_case via `@map`/`@@map`; Prisma fields camelCase; models PascalCase singular, tables plural.
- **Multi-tenant:** nearly every table is scoped by `restaurant_id`, and uniqueness is per-tenant (e.g. `@@unique([restaurantId, email])`), not global.
- Native Postgres enums; FK columns and common tenant/status filters are indexed.
- **Known limitation:** "one COMPLETED payment per bill" can't be expressed in Prisma — it's a partial unique index added by a raw migration (`20260918220600_payments_one_completed_per_bill`). Constraints of this kind need hand-written migrations.
- After editing the schema, run `generate`, then create a migration; never edit the DB by hand.

## Project status

Sprint 0 bootstrap. The only wired end-to-end path is `GET /status` → web status indicator. No auth, no business logic, and the DB/Prisma client is not yet wired into `apps/api` (the schema and migrations exist in `@rms/db`; the app consumes it in later sprints). Business domains (identity, reservations, orders, KOT, billing) are modeled in the schema and roadmapped but not implemented.

## Conventions

- TypeScript strict everywhere (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`); prefer explicit return types on exported functions.
- Validate all external input at the boundary with Zod; surface errors through the global filter (no silent failures).
- Prettier: single quotes, semicolons, trailing commas, 100 col width.
- Branches use the Jira key: `feature/RMS-123-short-description`. `yarn lint && yarn typecheck && yarn test` must pass before a PR; squash-merge into `main`.

Deeper detail lives in `docs/01-development-guide.md`, `docs/02-api-standards.md`, `docs/03-technical-standards-architecture.md`.
