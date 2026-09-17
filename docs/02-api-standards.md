# API Standards

Conventions for the NestJS REST API.

## Base URL & versioning

- Local base URL: `http://localhost:3000`
- Interactive docs (Swagger/OpenAPI): `/api/docs`
- Versioning strategy: URI-based (`/v1/...`) will be introduced when the first breaking change ships. Sprint 0 endpoints are unversioned.

## Shared contracts

Request and response shapes are defined once in `@rms/api-contract` as **Zod schemas**, with TypeScript types inferred from them. Both the API (validation via `nestjs-zod`) and the web client import the same schemas, so the two can never drift.

## Request conventions

- `Content-Type: application/json` for all request bodies.
- Request bodies (once introduced) are validated against their Zod schema; invalid payloads return `400` with per-field messages.
- Authentication is not yet implemented; it will use a **Bearer JWT** (`Authorization: Bearer <token>`) in a later sprint.

## Response conventions

- `2xx` responses return the resource or a resource envelope directly.
- Timestamps are ISO-8601 strings (UTC).
- List endpoints use the `Paginated<T>` shape from `@rms/shared` (`{ data, meta }`).

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

## Endpoints (Sprint 0 bootstrap)

| Method | Path      | Auth   | Description                              |
| ------ | --------- | ------ | ---------------------------------------- |
| GET    | `/status` | Public | Reports the API is online (`StatusResponse`) |

`GET /status` returns the shared `StatusResponse` contract:

```json
{ "status": "online", "service": "rms-api", "version": "0.0.0", "timestamp": "2026-01-01T00:00:00.000Z" }
```

## Authorization (future)

Roles and permissions are defined in `@rms/permissions` for future use. Guards will consult `roleHasPermission(role, permission)` — never hard-code role checks in controllers.
