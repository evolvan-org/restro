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

- Branch from `main` using the Jira key: `<type>/<JIRA-KEY>-<slug>`, e.g. `feature/REST-24-ci-pipeline`, `fix/REST-101-login-casing`. Suggested types: `feature`, `fix`, `chore`, `hotfix`, `bugfix`, `release`, `docs`, `refactor`, `test`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`) as a convention.
- Keep PRs scoped to a single story where possible.
- Reference the Jira key in the PR title and description.
- After opening a PR, a structured QA test plan is posted to the linked Jira ticket.

## Git hooks (pre-push)

A Husky `pre-push` hook runs automatically on `git push` (enabled by `yarn install`). It validates only what the push introduces — the changed files:

- `prettier --check` on changed files
- ESLint (including import order via `simple-import-sort`) on changed app source

There is no per-commit hook. To bypass in an emergency, use `git push --no-verify` (CI still enforces the same checks).

**Fixing failures:** most formatting and import-order issues are auto-fixable — run `yarn fix` (which runs `yarn lint:fix` then `yarn format`), then amend or add a commit and push again.

## Continuous integration

Every PR to `main` runs `.github/workflows/ci.yml`:

- **`verify`** (one job, all static checks): install (immutable lockfile), lint, format check, typecheck, Prisma migration-drift, and gitleaks secret scan. Each check reports independently even if an earlier one fails.
- **`docker-smoke`** (gated behind `verify`): builds both images with layer caching and boots the full stack via `docker compose up --wait`, which also runs `prisma migrate deploy`.

CI running does not block a merge on its own — enable branch protection with required status checks on `main` to make failures blocking.

## Pull requests

1. `yarn lint && yarn typecheck && yarn test` must pass locally (the pre-push hook and CI enforce this).
2. Update or add documentation for user-facing or contract changes.
3. Request review; address all Critical/Important review findings before merge.
4. Squash-merge into `main`.

## Releases

Releases are cut from `main`. A database and migration workflow will be added to the deploy pipeline when persistence lands in a later sprint.

## Sprint process

Two-week sprints following the roadmap in the root README. Sprint 0 delivers this bootstrap; business features land incrementally in Sprints 1–8.
