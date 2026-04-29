import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  AUTH_ACCESS_TOKEN_COOKIE,
  AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
  AUTH_REFRESH_TOKEN_COOKIE,
  AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE,
  AUTH_TOKEN_TYPE_COOKIE,
  AUTH_USER_COOKIE,
  deserializeAuthUser,
  type AuthUser,
  type StoredAuthState,
} from '@/lib/auth-client';

export interface ServerAuthState
  extends Pick<
    StoredAuthState,
    | 'accessToken'
    | 'refreshToken'
    | 'tokenType'
    | 'accessTokenExpiresAt'
    | 'refreshTokenExpiresAt'
  > {
  user: AuthUser | null;
}

function readNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTokenType(value: string | undefined) {
  const tokenType = value?.trim();
  return tokenType || 'Bearer';
}

function isExpired(expiresAt: number | null) {
  return typeof expiresAt === 'number' && expiresAt <= Date.now();
}

export async function getServerAuthState(): Promise<ServerAuthState | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_TOKEN_COOKIE)?.value?.trim();
  const accessTokenExpiresAt = readNumber(
    cookieStore.get(AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE)?.value,
  );

  if (!accessToken || isExpired(accessTokenExpiresAt)) {
    return null;
  }

  return {
    user: deserializeAuthUser(cookieStore.get(AUTH_USER_COOKIE)?.value),
    tokenType: normalizeTokenType(cookieStore.get(AUTH_TOKEN_TYPE_COOKIE)?.value),
    accessToken,
    refreshToken:
      cookieStore.get(AUTH_REFRESH_TOKEN_COOKIE)?.value?.trim() || null,
    accessTokenExpiresAt,
    refreshTokenExpiresAt: readNumber(
      cookieStore.get(AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE)?.value,
    ),
  };
}

export async function requireServerAuthState() {
  const authState = await getServerAuthState();

  if (!authState?.accessToken) {
    redirect('/login');
  }

  return authState;
}
