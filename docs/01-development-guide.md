# Development Guide

Team workflow, sprint process, and contribution mechanics for the Restaurant Management System.

## Package manager

This repository uses **Yarn (v4)** exclusively. Do not run `npm` — a stray `package-lock.json` breaks workspace resolution. Use `corepack enable` to pin the correct Yarn version automatically.

## Local setup

```bash
yarn install
cp .env.example .env
yarn dev
```

- Web: http://localhost:3001
- API: http://localhost:3000
- API status: http://localhost:3000/status
- Swagger: http://localhost:3000/api/docs

No database is required for the Sprint 0 bootstrap.

## Monorepo layout

| Path                    | Workspace           | Purpose                      |
| ----------------------- | ------------------- | ---------------------------- |
| `apps/web`              | `@rms/web`          | Next.js frontend             |
| `apps/api`              | `@rms/api`          | NestJS backend               |
| `packages/api-contract` | `@rms/api-contract` | Zod schemas + inferred types |
| `packages/permissions`  | `@rms/permissions`  | Roles & permission policy    |
| `packages/shared`       | `@rms/shared`       | Framework-agnostic utilities |

Turborepo drives cross-workspace tasks (`yarn dev`, `yarn build`, `yarn lint`, `yarn typecheck`, `yarn test`).

## Branching & Jira workflow

- Branch from `main` using the Jira key: `feature/RMS-123-short-description`, `fix/RMS-124-...`.
- Keep PRs scoped to a single story where possible.
- Reference the Jira key in the PR title and description.
- After opening a PR, a structured QA test plan is posted to the linked Jira ticket.

## Pull requests

1. `yarn lint && yarn typecheck && yarn test` must pass locally.
2. Update or add documentation for user-facing or contract changes.
3. Request review; address all Critical/Important review findings before merge.
4. Squash-merge into `main`.

## Releases

Releases are cut from `main`. A database and migration workflow will be added to the deploy pipeline when persistence lands in a later sprint.

## Sprint process

Two-week sprints following the roadmap in the root README. Sprint 0 delivers this bootstrap; business features land incrementally in Sprints 1–8.
