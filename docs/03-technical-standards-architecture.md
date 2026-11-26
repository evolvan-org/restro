# Technical Standards & Architecture Guide

Coding standards, architecture, and database conventions.

## Layered architecture (target)

The API follows a strict layering. Dependencies point inward; outer layers may depend on inner ones, never the reverse. Only the Controller layer exists in the Sprint 0 bootstrap; the Service, Repository, and persistence layers arrive as features land.

```
Controller  ──►  Service (business logic)  ──►  Repository  ──►  Prisma  ──►  PostgreSQL
```

| Layer          | Responsibility                                      | Status                          |
| -------------- | --------------------------------------------------- | ------------------------------- |
| **Controller** | HTTP concerns: routing, DTO binding, status codes   | in use (`status.controller.ts`) |
| **Service**    | Business rules, orchestration, entity → DTO mapping | later sprint                    |
| **Repository** | The only place Prisma is touched for an entity      | later sprint                    |
| **Prisma**     | Generated client + schema                           | later sprint                    |

**Rule:** controllers never call Prisma directly; repositories never contain business rules.

## Module structure (feature-based)

Each domain is a self-contained NestJS module (currently `status/`; `auth/`, `orders/`, ... to come) exposing only what other modules need via its `@Module` `exports`. Cross-cutting infrastructure (`common/`, and later `prisma/`) is shared.

## Shared packages & dependency direction

```
@rms/shared  ◄──  @rms/api-contract  ◄──  apps/api, apps/web
@rms/permissions ◄──────────────────────  apps/api, apps/web
```

- `@rms/shared` — no framework imports (usable anywhere).
- `@rms/permissions` — pure policy data; the single source of truth for roles.
- `@rms/api-contract` — Zod schemas; depends only on `@rms/permissions`.

## Coding standards

- **TypeScript strict mode** everywhere (`strict`, `noUncheckedIndexedAccess`).
- Prefer explicit return types on exported functions and public methods.
- No silent failures — handle or propagate errors; the API surfaces them through the global filter.
- Formatting via Prettier; linting via ESLint with import order enforced by `simple-import-sort`. A pre-push hook runs format and lint on changed files automatically; CI runs the full `yarn lint` / `yarn typecheck` on every PR.
- Validate all external input at the boundary with Zod.

## Database conventions (future)

> No database is wired into the Sprint 0 bootstrap. These conventions apply once persistence lands.

- **PostgreSQL** is the system of record; **Prisma** is the ORM.
- Table names are snake_case plural (`@@map("users")`); model names are PascalCase singular.
- Primary keys are UUIDs (`@db.Uuid`, `@default(uuid())`).
- Every table carries `createdAt` / `updatedAt`.
- Enums (e.g. `Role`) are mirrored between Prisma and `@rms/permissions`; keep them in sync.
- Schema changes ship as Prisma migrations (`yarn db:migrate`); never edit the database by hand.

## Environment & configuration

Environment variables are validated at boot via a Zod schema (`src/config/env.validation.ts`); the API fails fast on misconfiguration. The root `.env` is the source of truth in development.

Transactional email is isolated behind `EmailService`; feature modules use logical template keys and typed variables only. Brevo owns subjects and bodies. Every environment uses the real provider, so a verified sender, API key, and active template IDs are required before starting the API.

## Realtime (REST-88 decision)

Live screens use the existing **Pusher Channels** app, not SSE: it needs no sticky connections or
shared pub/sub across API instances (there is no Redis), and staff notifications already run on it.

- Private channels only. `private-restaurant-<id>-user-<id>-notifications` (the bell),
  `private-restaurant-<id>-qr` (QR queue, floor board, kitchen/bar displays; any of `qr-order:read`,
  `kot:read`, `floor:read`) and `private-qr-session-<id>` (one guest table visit, authorized with the
  device's guest secret).
- Events carry ids only, never names, amounts or PII. Clients refetch over HTTPS on receipt.
- Fallback: every live query also polls (15 s staff, 5 s guest while the socket is down) and
  resyncs on reconnect, so a dropped socket degrades to slower updates, never stale state.
- Publishing is best effort after the transaction commits; a Pusher failure never fails a request.

Time-based work (QR escalation) does not use in-memory timers: deadlines are stored
(`qr_rounds.escalate_at`) and a 15 s sweep claims due rows with one `UPDATE … RETURNING`, so each
round escalates exactly once across instances and nothing is lost on restart.

## Testing

- Backend: Jest (`yarn workspace @rms/api test`).
- Favor behavior-focused tests with real dependencies where practical; mock only at true boundaries.
