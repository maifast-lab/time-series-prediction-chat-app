import 'server-only';

import type { NextResponse } from 'next/server';

import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE,
  AUTH_TOKEN_TYPE_COOKIE,
  AUTH_USER_COOKIE,
  type AuthUser,
} from '@/lib/auth-client';

const isProduction = process.env.NODE_ENV === 'production';
const AUTH_COOKIE_NAMES = [
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AUTH_TOKEN_TYPE_COOKIE,
  AUTH_USER_COOKIE,
  AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE,
];

function getCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    ...(typeof maxAge === 'number' ? { maxAge } : {}),
  };
}

export function resolveAuthExpiresAt(input: {
  expiresIn?: number | null;
  expiresAt?: number | null;
}) {
  if (typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt)) {
    return input.expiresAt > 10_000_000_000
      ? input.expiresAt
      : input.expiresAt * 1000;
  }

  if (typeof input.expiresIn === 'number' && Number.isFinite(input.expiresIn)) {
    return Date.now() + input.expiresIn * 1000;
  }

  return null;
}

function getMaxAge(expiresAt: number | null) {
  if (typeof expiresAt !== 'number') {
    return undefined;
  }

  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export function setAuthCookies(
  response: NextResponse,
  input: {
    accessToken: string;
    tokenType: string;
    user: AuthUser | null;
    accessTokenExpiresAt: number | null;
  },
) {
  const maxAge = getMaxAge(input.accessTokenExpiresAt);

  response.cookies.set(
    AUTH_ACCESS_TOKEN_COOKIE,
    input.accessToken,
    getCookieOptions(maxAge),
  );
  response.cookies.set(
    AUTH_TOKEN_TYPE_COOKIE,
    input.tokenType,
    getCookieOptions(maxAge),
  );

  if (input.user) {
    response.cookies.set(
      AUTH_USER_COOKIE,
      JSON.stringify(input.user),
      getCookieOptions(maxAge),
    );
  } else {
    response.cookies.delete(AUTH_USER_COOKIE);
  }

  if (input.accessTokenExpiresAt) {
    response.cookies.set(
      AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
      String(input.accessTokenExpiresAt),
      getCookieOptions(maxAge),
    );
  } else {
    response.cookies.delete(AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE);
  }

  response.cookies.set(AUTH_REFRESH_TOKEN_COOKIE, '', {
    ...getCookieOptions(0),
    expires: new Date(0),
  });
  response.cookies.set(AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE, '', {
    ...getCookieOptions(0),
    expires: new Date(0),
  });
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', {
      ...getCookieOptions(0),
      expires: new Date(0),
    });
    response.cookies.delete(name);
  }
}
