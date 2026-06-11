import { API_BASE_URL } from '@/lib/api-base-url';

export interface AuthUser {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface StoredAuthState {
  user: AuthUser | null;
  tokenType: string;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
}

export interface GoogleIdTokenPayload {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?:
        | 'signin_with'
        | 'signup_with'
        | 'continue_with'
        | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      width?: number;
      logo_alignment?: 'left' | 'center';
    },
  ): void;
}

interface GoogleAuthResponse {
  success?: boolean;
  ok?: boolean;
  message?: string;
  error?: string;
  data?: unknown;
  user?: unknown;
  tokenType?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  accessTokenExpiresIn?: unknown;
  refreshTokenExpiresIn?: unknown;
  accessTokenExpiresAt?: unknown;
  refreshTokenExpiresAt?: unknown;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsIdApi;
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';
const GOOGLE_AUTH_EXCHANGE_PATH =
  process.env.NEXT_PUBLIC_AUTH_GOOGLE_EXCHANGE_PATH?.trim() ||
  '/api/auth/google';

export const AUTH_STATE_CHANGED_EVENT = 'maifast-auth-changed';

export const AUTH_ACCESS_TOKEN_COOKIE = 'maifast_access_token';
export const AUTH_REFRESH_TOKEN_COOKIE = 'maifast_refresh_token';
export const AUTH_TOKEN_TYPE_COOKIE = 'maifast_token_type';
export const AUTH_USER_COOKIE = 'maifast_auth_user';
export const AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE =
  'maifast_access_token_expires_at';
export const AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE =
  'maifast_refresh_token_expires_at';

const AUTH_ACCESS_TOKEN_STORAGE_KEY = 'maifast.auth.accessToken';
const AUTH_REFRESH_TOKEN_STORAGE_KEY = 'maifast.auth.refreshToken';
const AUTH_TOKEN_TYPE_STORAGE_KEY = 'maifast.auth.tokenType';
const AUTH_USER_STORAGE_KEY = 'maifast.auth.user';
const AUTH_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY =
  'maifast.auth.accessTokenExpiresAt';
const AUTH_REFRESH_TOKEN_EXPIRES_AT_STORAGE_KEY =
  'maifast.auth.refreshTokenExpiresAt';

let googleIdentityScriptPromise: Promise<void> | null = null;

export class AuthClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function resolveAuthUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

function readObject(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function pickNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return null;
}

function ttlToExpiresAt(value: unknown) {
  const seconds = pickNumber(value);

  if (seconds === null || seconds <= 0) {
    return null;
  }

  return Date.now() + seconds * 1000;
}

function normalizeAbsoluteExpiresAt(value: unknown) {
  const timestamp = pickNumber(value);

  if (timestamp === null || timestamp <= 0) {
    return null;
  }

  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function normalizeExpiresAt(ttlValue: unknown, absoluteValue: unknown) {
  return normalizeAbsoluteExpiresAt(absoluteValue) ?? ttlToExpiresAt(ttlValue);
}

function normalizeTokenType(value: unknown) {
  return pickString(value) ?? 'Bearer';
}

function isExpired(expiresAt: number | null) {
  return typeof expiresAt === 'number' && expiresAt <= Date.now();
}

function serializeAuthUser(user: AuthUser | null) {
  if (!user) {
    return null;
  }

  return JSON.stringify(user);
}

export function deserializeAuthUser(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeAuthUser(parsed);
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown, fallback: string) {
  const record = readObject(body);

  return (
    pickString(record?.error, record?.message) ??
    fallback
  );
}

function normalizeAuthUser(user: unknown): AuthUser | null {
  const record = readObject(user);

  if (!record) {
    return null;
  }

  const normalized: AuthUser = {
    id: pickString(record.id, record._id, record.sub),
    name: pickString(record.name, record.fullName, record.displayName),
    email: pickString(record.email),
    image: pickString(
      record.image,
      record.avatar,
      record.photo,
      record.photoURL,
      record.picture,
    ),
  };

  if (!normalized.id && !normalized.name && !normalized.email && !normalized.image) {
    return null;
  }

  return normalized;
}

function normalizeStoredAuthState(value: unknown) {
  const record = readObject(value);
  const accessToken = pickString(record?.accessToken);

  if (!accessToken) {
    return null;
  }

  const authState: StoredAuthState = {
    user: normalizeAuthUser(record?.user),
    tokenType: normalizeTokenType(record?.tokenType),
    accessToken,
    refreshToken: pickString(record?.refreshToken),
    accessTokenExpiresAt: pickNumber(record?.accessTokenExpiresAt),
    refreshTokenExpiresAt: pickNumber(record?.refreshTokenExpiresAt),
  };

  if (isExpired(authState.accessTokenExpiresAt)) {
    return null;
  }

  return authState;
}

function normalizeGoogleAuthResponse(body: unknown) {
  const record = readObject(body) as GoogleAuthResponse | null;

  if (!record) {
    throw new AuthClientError('Google sign-in failed.', 500);
  }

  if (record.success === false || record.ok === false) {
    throw new AuthClientError(
      readErrorMessage(record, 'Google sign-in failed.'),
      500,
    );
  }

  const payload =
    (readObject(record.data) as GoogleAuthResponse | null) ?? record;
  const accessToken = pickString(payload.accessToken);

  if (!accessToken) {
    throw new AuthClientError(
      readErrorMessage(
        payload,
        readErrorMessage(
          record,
          'Google sign-in did not return an access token.',
        ),
      ),
      500,
    );
  }

  return {
    user: normalizeAuthUser(payload.user),
    tokenType: normalizeTokenType(payload.tokenType),
    accessToken,
    refreshToken: pickString(payload.refreshToken),
    accessTokenExpiresAt: normalizeExpiresAt(
      payload.accessTokenExpiresIn,
      payload.accessTokenExpiresAt,
    ),
    refreshTokenExpiresAt: normalizeExpiresAt(
      payload.refreshTokenExpiresIn,
      payload.refreshTokenExpiresAt,
    ),
  } satisfies StoredAuthState;
}

function readCookie(name: string) {
  if (!isBrowser()) {
    return null;
  }

  const encodedName = `${name}=`;
  const parts = document.cookie.split(';');

  for (const part of parts) {
    const cookie = part.trim();

    if (!cookie.startsWith(encodedName)) {
      continue;
    }

    return decodeURIComponent(cookie.slice(encodedName.length));
  }

  return null;
}

function writeCookie(name: string, value: string, expiresAt: number | null) {
  if (!isBrowser()) {
    return;
  }

  const maxAge =
    typeof expiresAt === 'number'
      ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      : null;

  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    maxAge !== null ? `Max-Age=${maxAge}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}

function deleteCookie(name: string) {
  if (!isBrowser()) {
    return;
  }

  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readLocalStorageValue(key: string) {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageValue(key: string, value: string | null) {
  if (!isBrowser()) {
    return;
  }

  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures and keep cookie storage as the fallback.
  }
}

function dispatchAuthStateChanged() {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
}

function persistAuthState(authState: StoredAuthState) {
  const serializedUser = serializeAuthUser(authState.user);
  const accessTokenExpiresAt =
    authState.accessTokenExpiresAt !== null
      ? String(authState.accessTokenExpiresAt)
      : null;
  const refreshTokenExpiresAt =
    authState.refreshTokenExpiresAt !== null
      ? String(authState.refreshTokenExpiresAt)
      : null;
  const userExpiry =
    authState.refreshTokenExpiresAt ?? authState.accessTokenExpiresAt;

  writeLocalStorageValue(AUTH_ACCESS_TOKEN_STORAGE_KEY, authState.accessToken);
  writeLocalStorageValue(AUTH_REFRESH_TOKEN_STORAGE_KEY, authState.refreshToken);
  writeLocalStorageValue(AUTH_TOKEN_TYPE_STORAGE_KEY, authState.tokenType);
  writeLocalStorageValue(AUTH_USER_STORAGE_KEY, serializedUser);
  writeLocalStorageValue(
    AUTH_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY,
    accessTokenExpiresAt,
  );
  writeLocalStorageValue(
    AUTH_REFRESH_TOKEN_EXPIRES_AT_STORAGE_KEY,
    refreshTokenExpiresAt,
  );

  writeCookie(
    AUTH_ACCESS_TOKEN_COOKIE,
    authState.accessToken,
    authState.accessTokenExpiresAt,
  );
  writeCookie(
    AUTH_REFRESH_TOKEN_COOKIE,
    authState.refreshToken ?? '',
    authState.refreshTokenExpiresAt,
  );
  writeCookie(AUTH_TOKEN_TYPE_COOKIE, authState.tokenType, userExpiry);

  if (serializedUser) {
    writeCookie(AUTH_USER_COOKIE, serializedUser, userExpiry);
  } else {
    deleteCookie(AUTH_USER_COOKIE);
  }

  if (accessTokenExpiresAt) {
    writeCookie(
      AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE,
      accessTokenExpiresAt,
      authState.accessTokenExpiresAt,
    );
  } else {
    deleteCookie(AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE);
  }

  if (refreshTokenExpiresAt) {
    writeCookie(
      AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE,
      refreshTokenExpiresAt,
      authState.refreshTokenExpiresAt,
    );
  } else {
    deleteCookie(AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE);
  }

  dispatchAuthStateChanged();
}

export function clearStoredAuth() {
  writeLocalStorageValue(AUTH_ACCESS_TOKEN_STORAGE_KEY, null);
  writeLocalStorageValue(AUTH_REFRESH_TOKEN_STORAGE_KEY, null);
  writeLocalStorageValue(AUTH_TOKEN_TYPE_STORAGE_KEY, null);
  writeLocalStorageValue(AUTH_USER_STORAGE_KEY, null);
  writeLocalStorageValue(AUTH_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY, null);
  writeLocalStorageValue(AUTH_REFRESH_TOKEN_EXPIRES_AT_STORAGE_KEY, null);

  deleteCookie(AUTH_ACCESS_TOKEN_COOKIE);
  deleteCookie(AUTH_REFRESH_TOKEN_COOKIE);
  deleteCookie(AUTH_TOKEN_TYPE_COOKIE);
  deleteCookie(AUTH_USER_COOKIE);
  deleteCookie(AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE);
  deleteCookie(AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE);

  dispatchAuthStateChanged();
}

export function getStoredAuth() {
  if (!isBrowser()) {
    return null;
  }

  const rawAuthState = {
    user: deserializeAuthUser(
      readLocalStorageValue(AUTH_USER_STORAGE_KEY) ?? readCookie(AUTH_USER_COOKIE),
    ),
    tokenType:
      readLocalStorageValue(AUTH_TOKEN_TYPE_STORAGE_KEY) ??
      readCookie(AUTH_TOKEN_TYPE_COOKIE),
    accessToken:
      readLocalStorageValue(AUTH_ACCESS_TOKEN_STORAGE_KEY) ??
      readCookie(AUTH_ACCESS_TOKEN_COOKIE),
    refreshToken:
      readLocalStorageValue(AUTH_REFRESH_TOKEN_STORAGE_KEY) ??
      readCookie(AUTH_REFRESH_TOKEN_COOKIE),
    accessTokenExpiresAt:
      readLocalStorageValue(AUTH_ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY) ??
      readCookie(AUTH_ACCESS_TOKEN_EXPIRES_AT_COOKIE),
    refreshTokenExpiresAt:
      readLocalStorageValue(AUTH_REFRESH_TOKEN_EXPIRES_AT_STORAGE_KEY) ??
      readCookie(AUTH_REFRESH_TOKEN_EXPIRES_AT_COOKIE),
  };
  const authState = normalizeStoredAuthState(rawAuthState);

  if (!authState) {
    if (
      rawAuthState.user ||
      rawAuthState.tokenType ||
      rawAuthState.accessToken ||
      rawAuthState.refreshToken ||
      rawAuthState.accessTokenExpiresAt ||
      rawAuthState.refreshTokenExpiresAt
    ) {
      clearStoredAuth();
    }

    return null;
  }

  return authState;
}

export function getStoredAuthorizationHeader() {
  const authState = getStoredAuth();
  return getAuthorizationHeaderValue(authState);
}

export function getAuthorizationHeaderValue(
  authState: Pick<StoredAuthState, 'accessToken' | 'tokenType'> | null,
) {
  if (!authState?.accessToken) {
    return null;
  }

  return `${normalizeTokenType(authState.tokenType)} ${authState.accessToken}`;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function getGoogleClientId() {
  return GOOGLE_CLIENT_ID;
}

export function decodeGoogleCredential(
  credential: string,
): GoogleIdTokenPayload | null {
  try {
    const [, payload] = credential.split('.');

    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload)) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

export async function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') {
    throw new AuthClientError(
      'Google Identity Services can only load in the browser.',
      0,
    );
  }

  if (window.google?.accounts?.id) {
    return;
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[data-google-identity="true"]',
      ) as HTMLScriptElement | null;

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener(
          'error',
          () =>
            reject(
              new AuthClientError(
                'Failed to load Google Identity Services.',
                0,
              ),
            ),
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.onload = () => resolve();
      script.onerror = () =>
        reject(
          new AuthClientError('Failed to load Google Identity Services.', 0),
        );
      document.head.appendChild(script);
    });
  }

  await googleIdentityScriptPromise;

  if (!window.google?.accounts?.id) {
    throw new AuthClientError('Google Identity Services is unavailable.', 0);
  }
}

export async function exchangeGoogleCredential(
  credential: string,
  profile?: GoogleIdTokenPayload | null,
) {
  const url = resolveAuthUrl(GOOGLE_AUTH_EXCHANGE_PATH);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        credential,
        profile,
      }),
    });
  } catch (error) {
    throw new AuthClientError(
      `Could not reach Google auth exchange API at ${url}.`,
      0,
      error,
    );
  }

  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new AuthClientError(
      readErrorMessage(body, 'Google sign-in failed.'),
      response.status || 500,
    );
  }

  const authState = normalizeGoogleAuthResponse(body);
  persistAuthState(authState);

  return authState;
}

export async function signOut() {
  clearStoredAuth();
}
