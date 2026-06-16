# Admin API Contract

This frontend is a public UI only. It has no database, migrations, server-side business logic, queues, or durable local state. The Admin API owns authentication, authorization, chats, suggestions, sheet data, data sources, and persistence.

Keep this frontend separate while `www` and `admin` use different subdomains. Do not merge it into the Admin app unless the public and admin URL spaces are redesigned first; the current route sets would collide.

## Base URLs

- Public frontend: `NEXT_PUBLIC_SITE_URL`, normally the `www` origin.
- Admin API: `NEXT_PUBLIC_BACKEND_URL`, used by server-side route handlers.
- Google auth exchange path: local `/api/auth/google`, which forwards to the Admin API and stores the access token in httpOnly cookies.
- Python cleaner API: `PYTHON_BACKEND_URL`, used only by the server-side `/api/clean-data` route.

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

The browser posts Google Identity Services credentials to the public frontend:

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

Authenticated browser requests call same-origin `/api/*` paths. The public frontend route handlers read the httpOnly session cookie and forward `Authorization: Bearer <accessToken>` to the Admin API.

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

File uploads are first sent to the public frontend:

```http
POST /api/clean-data
```

The server-side route sends the file to the Python cleaner at `/api/v1/clean_data` with the authenticated user id. The cleaner response must include one of `cleanedData`, `cleaned_data`, or `data`. The frontend then forwards the cleaned payload to `POST /api/data-sources`.
