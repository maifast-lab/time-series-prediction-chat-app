import { NextResponse } from 'next/server';

import { resolveApiUrl } from '@/lib/api-base-url';
import type { AuthUser } from '@/lib/auth-client';
import { setAuthCookies, resolveAuthExpiresAt } from '@/lib/server/auth-cookies';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: pickString(value.id) ?? pickString(value._id),
    name: pickString(value.name),
    email: pickString(value.email),
    image: pickString(value.image) ?? pickString(value.picture),
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const upstreamResponse = await fetch(resolveApiUrl('/api/auth/google'), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': request.headers.get('content-type') ?? 'application/json',
    },
    body: bodyText,
  });
  const upstreamBody = (await upstreamResponse.json().catch(() => null)) as unknown;

  if (!upstreamResponse.ok || !isRecord(upstreamBody) || upstreamBody.ok === false) {
    return NextResponse.json(
      isRecord(upstreamBody)
        ? upstreamBody
        : {
            ok: false,
            error: upstreamResponse.statusText || 'Google login failed',
          },
      { status: upstreamResponse.status || 500 },
    );
  }

  const payload = isRecord(upstreamBody.data) ? upstreamBody.data : upstreamBody;
  const accessToken = pickString(payload.accessToken);

  if (!accessToken) {
    return jsonError('Google login did not return an access token', 502);
  }

  const tokenType = pickString(payload.tokenType) ?? 'Bearer';
  const accessTokenExpiresAt = resolveAuthExpiresAt({
    expiresIn: pickNumber(payload.accessTokenExpiresIn),
    expiresAt: pickNumber(payload.accessTokenExpiresAt),
  });
  const user = normalizeAuthUser(payload.user);
  const response = NextResponse.json({
    ok: true,
    data: {
      message: pickString(payload.message) ?? 'Google login successful',
      user,
      tokenType,
      accessTokenExpiresAt,
    },
  });

  setAuthCookies(response, {
    accessToken,
    tokenType,
    user,
    accessTokenExpiresAt,
  });

  response.headers.set('Cache-Control', 'no-store');

  return response;
}
