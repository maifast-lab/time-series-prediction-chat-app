import { NextResponse } from 'next/server';

import { resolveApiUrl } from '@/lib/api-base-url';
import type { AuthUser } from '@/lib/auth-client';
import { setAuthCookies, resolveAuthExpiresAt } from '@/lib/server/auth-cookies';
import { fetchUpstream, UpstreamFetchError } from '@/lib/server/upstream-fetch';

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

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwtPayload(value: unknown) {
  const token = pickString(value);
  const [, payload] = token?.split('.') ?? [];

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const user = {
    id: pickString(value.id) ??
      pickString(value._id) ??
      pickString(value.sub) ??
      pickString(value.userId) ??
      pickString(value.googleId),
    name: pickString(value.name),
    email: pickString(value.email),
    image: pickString(value.image) ??
      pickString(value.avatar) ??
      pickString(value.photo) ??
      pickString(value.photoURL) ??
      pickString(value.picture),
  };

  return user.id || user.name || user.email || user.image ? user : null;
}

function mergeAuthUsers(...users: Array<AuthUser | null>) {
  const merged = users.reduce<AuthUser>(
    (current, user) => ({
      id: current.id ?? user?.id ?? null,
      name: current.name ?? user?.name ?? null,
      email: current.email ?? user?.email ?? null,
      image: current.image ?? user?.image ?? null,
    }),
    {
      id: null,
      name: null,
      email: null,
      image: null,
    },
  );

  return merged.id || merged.name || merged.email || merged.image
    ? merged
    : null;
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
  const requestBody = parseJsonObject(bodyText);
  const requestProfile = mergeAuthUsers(
    normalizeAuthUser(requestBody?.profile),
    normalizeAuthUser(decodeJwtPayload(requestBody?.credential)),
  );
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetchUpstream(resolveApiUrl('/api/auth/google'), {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': request.headers.get('content-type') ?? 'application/json',
      },
      body: bodyText,
    });
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      return jsonError(error.message, 502);
    }

    throw error;
  }

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
  const user = mergeAuthUsers(
    normalizeAuthUser(payload.user),
    normalizeAuthUser(payload.profile),
    normalizeAuthUser(payload.account),
    normalizeAuthUser(payload),
    requestProfile,
  );
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
