# API Standards

Conventions for the NestJS REST API.

## Base URL & versioning

- Local base URL: `http://localhost:3000`
- Interactive docs (Swagger/OpenAPI): `/api/docs`
- Versioning strategy: URI-based (`/v1/...`) will be introduced when the first breaking change ships. Sprint 0 endpoints are unversioned.

## Shared contracts

Request and response shapes are defined once in `@rms/api-contract` as **Zod schemas**, with TypeScript types inferred from them. Both the API and the web client import the same schemas, so the two can never drift.

- **Validation:** controllers validate bodies with `ZodValidationPipe` (`common/pipes/`), passing the contract schema.
- **Swagger:** there are no DTO classes. Controllers pass contract schemas through `zodOpenApiSchema()` (`common/swagger/zod-openapi.ts`), e.g. `@ApiBody({ schema: zodOpenApiSchema(createStaffRequestSchema) })` and `@ApiOkResponse({ schema: zodOpenApiSchema(staffAccountSchema) })`; document query parameters with `@ApiZodQuery(schema)`. Don't hand-write OpenAPI schemas. Rules expressed with `.refine()` don't appear in OpenAPI, so document them with `.describe()` in the contract.

## Request conventions

- `Content-Type: application/json` for all request bodies.
- Request bodies are validated against their Zod schema; invalid payloads return `400` with per-field messages.
- Protected endpoints require a **Bearer JWT** (`Authorization: Bearer <token>`) issued by `POST /auth/login`. Protect a controller with `@UseGuards(JwtAuthGuard)` (`common/auth/`) and read the caller with `@CurrentUserId()`.

## Authentication & logout

Full details, including every `401` cause: [API Reference](04-api-reference.md#authentication).

- Access tokens are stateless JWTs that expire after 24 hours. `JwtAuthGuard` rejects missing, invalid or expired tokens with `401`.
- The web app stores the token in the persisted Redux `auth` slice (localStorage) and sends it through the axios request interceptor. A `401` response clears it.
- **Logout is client-side:** the web app deletes the stored token, clears cached query data and redirects to `/auth/login`. There is no logout endpoint and no server-side revocation, so a copy of a token taken before logout stays valid until it expires.
- Signed-in pages live under `app/(protected)/`. The layout redirects to `/auth/login` whenever there is no token, including after a refresh.

## Response conventions

- `2xx` responses return the resource or a resource envelope directly.
- Timestamps are ISO-8601 strings (UTC).
- List endpoints use the `Paginated<T>` shape from `@rms/shared` (`{ data, meta }`). In the contract, extend `paginationQuerySchema` for the query (`page`, `pageSize` ≤ 100) and wrap the item schema with `paginatedResponseSchema(item)`; build `meta` with `buildPageMeta`.

## Error envelope

Every error passes through a global exception filter and conforms to:

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/auth/login"
}
```

`message` may be a string or an array of strings (validation errors). Internal errors return a generic `500` message without leaking stack traces.

## Endpoints

| Method | Path                | Auth / permission | Description                                                                                                                                                |
| ------ | ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/status`           | Public            | Reports the API is online (`StatusResponse`)                                                                                                               |
| POST   | `/auth/login`       | Public            | Exchanges email + password for an access token (`LoginResponse`)                                                                                           |
| GET    | `/profile`          | Bearer            | Returns the caller's own profile, including role, read-only (`ProfileResponse`)                                                                            |
| PATCH  | `/profile`          | Bearer            | Updates the caller's name, email and phone (`UpdateProfileRequest` → `ProfileResponse`); `409` if the email is taken within the restaurant                 |
| PATCH  | `/profile/password` | Bearer            | Changes the caller's password (`ChangePasswordRequest` → `ChangePasswordResponse`); `400` if the current password is wrong                                 |
| GET    | `/staff`            | `user:read`       | Lists the restaurant's staff, active and inactive (`StaffListQuery` → `StaffListResponse`); `search` matches name or email, `status` filters               |
| GET    | `/staff/roles`      | `user:write`      | Roles the caller may assign (`StaffRolesResponse`)                                                                                                         |
| POST   | `/staff`            | `user:write`      | Creates an active account with a generated temporary password, returned only once (`CreateStaffRequest` → `CreateStaffResponse`); `409` on duplicate email |
| PATCH  | `/staff/:id`        | `user:write`      | Updates name, email, phone and role (`UpdateStaffRequest` → `StaffAccount`); you cannot change your own role                                               |
| PATCH  | `/staff/:id/status` | `user:write`      | Activates or deactivates an account (`UpdateStaffStatusRequest` → `StaffAccount`); inactive accounts cannot log in; you cannot change your own status      |

Request and response examples, field rules and the error messages of every endpoint are in the [API Reference](04-api-reference.md).

Profile endpoints act only on the authenticated user (taken from the token); there is no route that addresses another user's profile. Staff endpoints act only on accounts in the caller's restaurant; other ids return `404`.

`GET /status` returns the shared `StatusResponse` contract:

```json
{
  "status": "online",
  "service": "rms-api",
  "version": "0.0.0",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Authorization

Roles and permissions are defined in `@rms/permissions`; never hard-code role checks in controllers.

- Protect a route with `@UseGuards(JwtAuthGuard, PermissionsGuard)` and declare what it needs with `@RequirePermissions(Permission.X)` (method-level overrides class-level). Import `AuthorizationModule` (`common/auth/`) in the feature module.
- `PermissionsGuard` loads the caller's current role and status on every request and checks them with `roleHasAll`. An inactive caller gets `401`; a missing permission gets `403`. Role changes and deactivation therefore apply immediately on these routes.
- Handlers read the caller with `@CurrentActor()` (`{ userId, restaurantId, role }`). Use its `restaurantId` to scope every query to the caller's tenant.
- A role can be assigned only if it is a system role other than `CUSTOMER` and grants nothing beyond the assigner's own permissions. The same rule decides which accounts someone can edit or (de)activate, so a manager can create and manage `MANAGER` and `STAFF` accounts but not `ADMIN` ones.
- The web app mirrors the policy for UI gating only, via `usePermissions().can(permission)`; the API remains the enforcement point.

| Permission                                                           | ADMIN | MANAGER | STAFF | CUSTOMER |
| -------------------------------------------------------------------- | ----- | ------- | ----- | -------- |
| `user:read` (view staff)                                             | ✓     | ✓       |       |          |
| `user:write` (create, edit, activate/deactivate staff, assign roles) | ✓     | ✓       |       |          |
