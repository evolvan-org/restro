# Docker Assets

Local containerized stack: **postgres + api + web**.

## Files

| File                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `../docker-compose.yml` | Orchestrates the three services                                   |
| `Dockerfile`            | Multi-target build (`api`, `web`) for the Yarn/Turborepo monorepo |
| `entrypoint-api.sh`     | Runs `prisma migrate deploy` against Postgres, then boots the API |

## Local vs production

`docker compose` picks the stack from `COMPOSE_FILE` in the root `.env`:

| `COMPOSE_FILE`            | Stack      | api  | postgres | web  |
| ------------------------- | ---------- | ---- | -------- | ---- |
| `docker-compose.yml`      | local      | 3000 | 5433     | 3001 |
| `docker-compose.prod.yml` | production | 8000 | 5434     | 3001 |

Unset defaults to `docker-compose.yml`. Production also requires
`POSTGRES_PASSWORD`, `JWT_SECRET` and `RATE_LIMIT_HASH_SECRET`, and
`NEXT_PUBLIC_API_URL` set to the browser-facing API URL before building.

## Usage

```bash
# Build and start the whole stack
docker compose up --build

# Stop (database volume is preserved)
docker compose down

# Stop and wipe the database
docker compose down -v
```

Services:

- **web** — http://localhost:3001
- **api** — http://localhost:3000 (Swagger at `/api/docs`)
- **postgres** — `localhost:5433` (db `rms`, user/pass `postgres`/`postgres`)

## Migrations

The **api container applies migrations automatically** on startup via
`prisma migrate deploy` — committed migrations land on the Postgres container
with no manual step.

To **create** a new migration during development, run it from the host against
the exposed Postgres port (the root `.env` already targets `localhost:5433`):

```bash
yarn workspace @rms/db migrate:dev --name <change>
```

This generates the migration files locally _and_ applies them to the running
container. On the next `docker compose up`, the api entrypoint re-applies them
idempotently.

> First-time setup: `docker compose up -d postgres` to bring the DB up, then
> `yarn workspace @rms/db migrate:dev --name init` to create the initial
> migration, then `docker compose up --build` for the full stack.

## Continuous deployment (production VPS)

Every push to `main` deploys automatically via `.github/workflows/deploy.yml`.
`main` only takes release PRs from `development` (see
`docs/01-development-guide.md` → "Releases").
It runs on a **self-hosted GitHub Actions runner installed on the VPS**: the
runner connects _out_ to GitHub, so the server accepts no inbound SSH from
GitHub's rotating runner IPs.

| What               | Where                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Project + prod env | `/opt/restro` (`.env` with `COMPOSE_FILE=docker-compose.prod.yml`)                                        |
| Unix user          | `deploy` (in the `docker` group; owns `/opt/restro`)                                                      |
| Runner             | `/home/deploy/actions-runner`, label `vps-prod`, systemd service `actions.runner.evolvan-org-restro.ezer` |

A deploy runs `git fetch` + `git reset --hard <sha>` in `/opt/restro`, then
`docker compose up -d --build --wait`, which fails the job if any service is
not healthy. Pending migrations apply on api startup.

- **Manual deploy / redeploy:** Actions → Deploy → _Run workflow_.
- **Rollback:** revert the commit on `main` (a revert PR) so the next deploy
  ships the previous code. Migrations do not roll back on their own.
- **No GitHub credential is stored on the server:** the fetch uses the job's
  short-lived `GITHUB_TOKEN`, so a manual `git pull` on the VPS will not
  authenticate. Deploy through the workflow.
- **Run commands as `deploy`** in `/opt/restro`, e.g.
  `sudo -iu deploy bash -c 'cd /opt/restro && docker compose ps'`.
- **Runner service:** `cd /home/deploy/actions-runner && sudo ./svc.sh status`
  (also `start` / `stop`); logs with `journalctl -u 'actions.runner.*' -f`.
- **Security:** only `deploy.yml` may use `runs-on: [self-hosted, vps-prod]`.
  Never target this runner from a `pull_request` workflow.
