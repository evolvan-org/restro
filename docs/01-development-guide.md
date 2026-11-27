# Development Guide

## Staff preferences and thermal printers

The staff header remembers the theme and language in the current browser. The sidebar support link
uses `NEXT_PUBLIC_SUPPORT_URL` when configured and otherwise opens Restro’s internal help page.

Set a stable `AUTHENTICATOR_ENCRYPTION_KEY` before enrolling users on a deployment. The default
derives a separate key from `JWT_SECRET`. Changing the source key after enrollment prevents the
server from reading the existing authenticator secrets and recovery codes.

Choose the matching 58 mm or 80 mm roll in the browser’s print dialog. For direct ESC/POS printing,
configure `THERMAL_PRINTER_RESTAURANT_ID` on the API host. Managers can save the preferred connection,
network IPv4 address and TCP port, paper width, code page, and columns for each destination under
Restaurant Settings → Thermal printing.

The API only connects to endpoints in `THERMAL_NETWORK_TARGETS` or the destination’s existing
`THERMAL_*_NETWORK` setting. Use a comma-separated list of exact `IPv4:port` pairs for
`THERMAL_NETWORK_TARGETS`. USB destinations use a Linux `/dev/usb/lpN` device on the API host.
Pass the device through to a containerized API and give its service account write access.
Use Check connection to check the saved endpoint, then Send test print to verify paper width,
column count, and character encoding on the printer. Browser printing preserves the original text.
A successful direct job confirms that Restro sent the data over the connection.

Team workflow, sprint process, and contribution mechanics for the Restaurant Management System.

## Package manager

This repository uses **Yarn (v4)** exclusively. Do not run `npm` — a stray `package-lock.json` breaks workspace resolution. Use `corepack enable` to pin the correct Yarn version automatically.

## Local setup

```bash
yarn install
cp .env.example .env
yarn dev
```

Before starting the API, configure a Brevo API key, the three active transactional-template IDs,
and a verified sender in `.env`. The shared development sender is `sabarjits@evolvan.com`; production
must replace it with an address on the project's authenticated domain.

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

- Branch from `development` (the default branch) using the Jira key: `<type>/<JIRA-KEY>-<slug>`, e.g. `feature/REST-24-ci-pipeline`, `fix/REST-101-login-casing`. Suggested types: `feature`, `fix`, `chore`, `hotfix`, `bugfix`, `release`, `docs`, `refactor`, `test`.
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

Every PR to `development` runs `.github/workflows/ci.yml`. Release PRs (`development` → `main`) skip both jobs, since that code already passed CI on its way into `development`; skipped jobs report success, so the required checks on `main` still pass.

- **`verify`** (one job, all static checks): install (immutable lockfile), lint, format check, typecheck, Prisma migration-drift, and gitleaks secret scan. Each check reports independently even if an earlier one fails.
- **`docker-smoke`** (gated behind `verify`): builds both images with layer caching and boots the full stack via `docker compose up --wait`, which also runs `prisma migrate deploy`.

CI running does not block a merge on its own — enable branch protection with required status checks on `development` and `main` to make failures blocking.

## Pull requests

1. `yarn lint && yarn typecheck && yarn test` must pass locally (the pre-push hook and CI enforce this).
2. Update or add documentation for user-facing or contract changes.
3. Request review; address all Critical/Important review findings before merge.
4. Squash-merge into `development`.

## Releases

`development` is the integration branch; `main` is production.

1. Open a PR **from `development` into `main`** (the release PR). Only `development` is accepted: `.github/workflows/release-source.yml` fails the required `Release source` check for any other source branch.
2. Merge it with a **merge commit**, not squash. Squashing gives `main` commits that `development` never has, so the next release PR shows old changes again and conflicts.
3. The push to `main` triggers `.github/workflows/deploy.yml`, which deploys to the production VPS and applies pending migrations (see `docker/README.md` → "Continuous deployment").

Hotfix: branch from `main`, fix, merge into `development`, then release `development` → `main` as usual.

## Sprint process

Two-week sprints following the roadmap in the root README. Sprint 0 delivers this bootstrap; business features land incrementally in Sprints 1–8.
