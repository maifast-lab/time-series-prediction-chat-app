import type { ApiEnvelope } from '@/lib/api-response';
import { resolveApiUrl } from '@/lib/api-base-url';
import { getStoredAuthorizationHeader } from '@/lib/auth-client';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function requestApi<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const authorizationHeader = getStoredAuthorizationHeader();

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  if (authorizationHeader && !headers.has('authorization')) {
    headers.set('authorization', authorizationHeader);
  }

  const url = resolveApiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (error) {
    throw new ApiClientError(
      `Could not reach API at ${url}. Check that the backend is running and CORS allows this frontend origin.`,
      0,
      error,
    );
  }

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !body?.ok) {
    throw new ApiClientError(
      body && !body.ok ? body.error : 'Request failed',
      response.status || 500,
    );
  }

  return body.data;
}
