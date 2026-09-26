# Docker Assets

Local containerized stack: **postgres + api + web**.

## Files

| File                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `../docker-compose.yml` | Orchestrates the three services                                   |
| `Dockerfile`            | Multi-target build (`api`, `web`) for the Yarn/Turborepo monorepo |
| `entrypoint-api.sh`     | Runs `prisma migrate deploy` against Postgres, then boots the API |

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
