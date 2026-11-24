# syntax=docker/dockerfile:1.7
# -----------------------------------------------------------------------------
# Multi-target build for the RMS monorepo (Yarn 4 workspaces + Turborepo).
# Build context is the repo root. Targets: `api` and `web`.
#
#   docker build -f docker/Dockerfile --target api -t rms-api .
#   docker build -f docker/Dockerfile --target web -t rms-web .
#
# The `deps` and `source` stages are shared (one install + prisma generate);
# each image then compiles only its own app in `build-api` / `build-web`.
# -----------------------------------------------------------------------------

# ---- base: node + corepack (Yarn 4) + openssl (required by Prisma) ----------
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV CI=true
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install ALL workspace deps (cached until a manifest changes) ------
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml turbo.json tsconfig.base.json ./
COPY apps/web/package.json         apps/web/package.json
COPY apps/api/package.json         apps/api/package.json
COPY packages/shared/package.json  packages/shared/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
COPY packages/permissions/package.json  packages/permissions/package.json
COPY packages/db/package.json      packages/db/package.json
RUN yarn install --immutable

# ---- source: full source + generated Prisma client (shared by both builds) --
FROM deps AS source
COPY . .
RUN yarn workspace @rms/db prisma generate

# Each app compiles only itself and the packages it depends on (turbo's
# `--filter=<app>...`). Keeping them in separate stages matters: the web-only
# NEXT_PUBLIC_API_URL build arg used to sit in one shared stage, so whenever the
# web's value differed from the api's default (as in production), BuildKit saw
# two different stages and ran the full `yarn build` (Next included) twice.

# ---- build-api: NestJS + its packages ---------------------------------------
FROM source AS build-api
RUN yarn turbo run build --filter=@rms/api...

# ---- build-web: Next.js + its packages --------------------------------------
FROM source AS build-web
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# browser's API base URL must be known here (defaults to the host-exposed API).
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN yarn turbo run build --filter=@rms/web...

# ---- api: NestJS runtime ----------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
# Full built workspace incl. node_modules (Prisma CLI + generated client for
# `migrate deploy` at startup).
COPY --from=build-api /app ./
COPY docker/entrypoint-api.sh /usr/local/bin/entrypoint-api.sh
RUN chmod +x /usr/local/bin/entrypoint-api.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint-api.sh"]
CMD ["node", "apps/api/dist/main.js"]

# ---- web: Next.js runtime ---------------------------------------------------
FROM base AS web
ENV NODE_ENV=production
COPY --from=build-web /app ./
WORKDIR /app/apps/web
EXPOSE 3001
# Run Next directly instead of `yarn workspace ... start`: the Yarn binary is
# only downloaded by corepack in the `deps` stage, so calling `yarn` here makes
# corepack fetch it from repo.yarnpkg.com at container start, which fails
# whenever the container has no outbound DNS/network.
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3001"]
