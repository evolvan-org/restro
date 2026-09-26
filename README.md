# Restaurant Management System

A modern, scalable Restaurant Management System built using a monorepo architecture with Next.js, NestJS, PostgreSQL, and Prisma.

This project is being developed using Agile Scrum with a strong emphasis on clean architecture, maintainability, and long-term scalability.

---

## Project Status

🚧 **Project Bootstrap (Sprint 0)** — a minimal, runnable monorepo scaffold is in place.

Included in the bootstrap:

- Monorepo setup (Turborepo + Yarn workspaces)
- Frontend (Next.js) & Backend (NestJS) initialization
- Shared packages (`api-contract`, `permissions`, `shared`)
- A single wired end-to-end path: the API reports **online** via a shared
  contract, and the web app displays it and shows **Ready for development**
- API documentation (Swagger)
- Development standards & docs

> No business logic, authentication, or database is implemented yet — those
> land in later sprints. This bootstrap only proves the backend and frontend
> are wired together through a typed contract.

---

## Technology Stack

**Frontend:** Next.js · React · TypeScript · Tailwind CSS · Shadcn UI · TanStack Query · React Hook Form · Zod
**Backend:** NestJS · TypeScript · Prisma ORM · PostgreSQL · JWT Authentication · Swagger (OpenAPI)
**Monorepo:** Turborepo · Shared Packages · Shared API Contracts
**Infrastructure:** Docker · Docker Compose · Environment Variables

---

## Repository Structure

```
restaurant-management-system/
├── apps/
│   ├── web/                  # Next.js Application
│   └── api/                  # NestJS API
├── packages/
│   ├── api-contract/         # Shared DTOs & API Contracts (Zod)
│   ├── permissions/          # Roles & Permission Definitions
│   └── shared/               # Shared Utilities
├── docs/
│   ├── 01-development-guide.md
│   ├── 02-api-standards.md
│   └── 03-technical-standards-architecture.md
├── docker/                   # Docker assets (added in a later sprint)
├── package.json
├── turbo.json
└── README.md
```

---

## Prerequisites

- **Node.js** >= 20
- **Yarn** 4.x (this repo uses Yarn as its package manager — **do not use npm**)

---

## Running the Project

```bash
# 1. Install dependencies (Yarn only)
yarn install

# 2. Create your env file
cp .env.example .env

# 3. Run everything (web + api) in dev
yarn dev
```

Open http://localhost:3001 — the page reads the API's status endpoint and shows
whether the server is online.

| Service       | URL                            |
| ------------- | ------------------------------ |
| Web (Next.js) | http://localhost:3001          |
| API (NestJS)  | http://localhost:3000          |
| API status    | http://localhost:3000/status   |
| Swagger UI    | http://localhost:3000/api/docs |

> This project uses **Yarn** exclusively. Never run `npm install` — it would create a conflicting lockfile and break workspace resolution.

---

## Common Commands

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `yarn dev`          | Run web + api in watch mode (Turborepo) |
| `yarn build`        | Build all workspaces                    |
| `yarn lint`         | Lint all workspaces                     |
| `yarn lint:fix`     | Lint and auto-fix (incl. import order)  |
| `yarn typecheck`    | Type-check all workspaces               |
| `yarn test`         | Run all tests                           |
| `yarn format`       | Format the repo with Prettier           |
| `yarn format:check` | Check formatting (CI gate)              |
| `yarn fix`          | Auto-fix lint + import order + format   |

---

## Continuous Integration & Quality Gates

Every PR to `main` runs GitHub Actions (`.github/workflows/ci.yml`) as a single **verify**
job — install (immutable lockfile), lint, format check, typecheck, Prisma migration-drift,
and secret scan (gitleaks) — followed by a gated
**Docker smoke** job that builds both images and boots the full stack with
`docker compose up --wait`.

Locally, a **pre-push** hook (Husky) validates
formatting and lint over the files being pushed. Run `yarn install` once to
enable it. See the [Development Guide](docs/01-development-guide.md) for details.

---

## Documentation

| Document                                                                          | Purpose                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Development Guide](docs/01-development-guide.md)                                 | Team workflow, sprint process, Jira workflow, PRs, releases      |
| [API Standards](docs/02-api-standards.md)                                         | API conventions, request/response formats, auth, versioning      |
| [Technical Standards & Architecture](docs/03-technical-standards-architecture.md) | Coding standards, architecture, folder structure, DB conventions |

---

## Sprint Roadmap

**Current:** Sprint 0 – Project Bootstrap

**Upcoming:** Sprint 1 – Identity & Access Management · Sprint 2 – Restaurant Configuration · Sprint 3 – Reservations · Sprint 4 – Order Management · Sprint 5 – Kitchen & Bar Operations · Sprint 6 – Billing & Payments · Sprint 7 – Dashboard & Reports · Sprint 8 – MVP Stabilization

---

## License

This project is proprietary software. Unauthorized copying, modification, or distribution is prohibited unless approved by the project owner.
