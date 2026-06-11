# Admin API Contract

This frontend is a public UI only. It has no database, migrations, server-side business logic, queues, or durable local state. The Admin API owns authentication, authorization, chats, suggestions, sheet data, data sources, and persistence.

Keep this frontend separate while `www` and `admin` use different subdomains. Do not merge it into the Admin app unless the public and admin URL spaces are redesigned first; the current route sets would collide.

## Base URLs

- Public frontend: `NEXT_PUBLIC_SITE_URL`, normally the `www` origin.
- Admin API: `NEXT_PUBLIC_BACKEND_URL`.
- Google auth exchange path: `NEXT_PUBLIC_AUTH_GOOGLE_EXCHANGE_PATH`, resolved against `NEXT_PUBLIC_BACKEND_URL`.
- Python cleaner API: `NEXT_PUBLIC_PYTHON_BACKEND_URL`.

The Admin API must allow requests from `NEXT_PUBLIC_SITE_URL` through CORS.

## Response Envelope

All Admin API endpoints should return JSON in this envelope:

```ts
type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```

The frontend treats a non-2xx HTTP status or `{ ok: false }` as a failed request. Keep errors short and user-safe because they can surface in the UI.

## Authentication

The frontend posts Google Identity Services credentials to:

```http
POST /api/auth/google
Content-Type: application/json
```

Request body:

```ts
{
  credential: string;
  profile?: {
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
  } | null;
}
```

Target success response:

```ts
{
  ok: true;
  data: {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    tokenType?: string;
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresIn?: number;
    refreshTokenExpiresIn?: number;
  };
}
```

The frontend also accepts the legacy root-level token response during migration. New Admin work should use the envelope above.

Authenticated frontend requests send:

```http
Authorization: <tokenType> <accessToken>
```

`tokenType` defaults to `Bearer`.

## Admin Endpoints Used

- `GET /api/chats`
- `GET /api/chats/latest`
- `POST /api/chats`
- `GET /api/chats/:id`
- `PUT /api/chats/:id`
- `DELETE /api/chats/:id`
- `POST /api/chats/:id/messages`
- `POST /api/suggestion`
- `GET /api/data-sources`
- `POST /api/data-sources`
- `POST /api/sheet-data`
- `PATCH /api/sheet-data/:id`

## Python Cleaner Endpoint

File uploads are first sent to:

```http
POST /v1/clean_data
```

The cleaner response must include one of `cleanedData`, `cleaned_data`, or `data`. The frontend forwards the cleaned payload to `POST /api/data-sources` on the Admin API.
