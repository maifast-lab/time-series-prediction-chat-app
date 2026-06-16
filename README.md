# Maifast Public UI

Next.js frontend for the public Maifast chat and spreadsheet workspace.

This app is intentionally UI-only. It has no database, migrations, queues, or business logic. Authentication, chats, suggestions, sheet data, data sources, and persistence are owned by the Admin API configured through `NEXT_PUBLIC_BACKEND_URL`.

## Why This App Is Separate

Keep this frontend separate while public and admin traffic use different subdomains, for example `www.example.com` and `admin.example.com`.

Do not merge it into the Admin app unless the public and admin URLs are redesigned first. Current public routes such as `/`, `/login`, `/dashboard`, `/c/[id]`, `/edit/sheet`, and `/share-suggestion` can collide with admin routes.

## Requirements

- Node.js 20+
- pnpm 11+
- Running Admin API
- Running Python cleaner API for CSV/XLSX upload preprocessing
- Google OAuth web client configured for the public frontend origin

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The development server runs on:

```text
http://localhost:3001
```

The default local backend URLs are:

```text
Admin API: http://localhost:3000
Python cleaner API: http://127.0.0.1:8000/api/
```

## Environment

Use `.env.example` as the source of truth for required variables:

- `NEXT_PUBLIC_SITE_URL`: public frontend origin.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: browser Google OAuth client ID.
- `NEXT_PUBLIC_BACKEND_URL`: Admin API base URL used by the server-side proxy.
- `PYTHON_BACKEND_URL`: server-only Python cleaner API base URL.

Do not commit local `.env` or `.env.local` files.

## API Contract

The strict Admin API contract is documented in [docs/api-contract.md](docs/api-contract.md).

In short, normal Admin API responses must use:

```ts
type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
```

The browser calls same-origin `/api/*` routes. Those route handlers keep the bearer token in httpOnly cookies and forward authorized requests to the Admin API.

## Scripts

```bash
pnpm dev      # Start Next.js on port 3001
pnpm build    # Build production assets
pnpm start    # Serve the production build on port 3001
pnpm lint     # Run ESLint
```

## Deployment

Deploy this app as the public `www` frontend. Configure production environment variables to point at the production Admin API, server-only Python cleaner API, production site URL, and production Google OAuth client.

The Admin API deployment must allow the public origin in CORS and must keep the response envelope stable. If the Admin API route namespace changes, update `src/lib/api-hooks.ts`, `src/components/sheet-editor/sheet-editor-api.ts`, and `docs/api-contract.md` together.

## Validation Checklist

Run this checklist after Admin API or auth changes:

- Login with Google and verify redirect to the latest or newly created chat.
- Send a chat message and verify the assistant response persists after refresh.
- Upload a CSV/XLSX file and verify the cleaner result saves through `POST /api/data-sources`.
- Open `/edit/sheet`, filter rows, create a row, and edit a row.
- Open `/dashboard` and verify the authenticated layout renders without API errors.
- Submit `/share-suggestion` and verify the Admin API receives it.
