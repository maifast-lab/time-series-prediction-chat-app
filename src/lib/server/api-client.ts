import { getAuthorizationHeaderValue } from '@/lib/auth-client';
import { resolveApiUrl } from '@/lib/api-base-url';
import type { ApiEnvelope } from '@/lib/api-response';
import { getServerAuthState } from '@/lib/server/auth';
import { fetchUpstream, UpstreamFetchError } from '@/lib/server/upstream-fetch';

export class ServerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

async function requestServerResponse(path: string, init?: RequestInit) {
  const outgoingHeaders = new Headers(init?.headers);
  const authState = await getServerAuthState();

  outgoingHeaders.set('accept', 'application/json');

  const authorizationHeader = getAuthorizationHeaderValue(authState);

  if (authorizationHeader && !outgoingHeaders.has('authorization')) {
    outgoingHeaders.set('authorization', authorizationHeader);
  }

  let response: Response;

  try {
    response = await fetchUpstream(resolveApiUrl(path), {
      ...init,
      headers: outgoingHeaders,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      throw new ServerApiError(error.message, 502, error);
    }

    throw error;
  }

  return response;
}

function isJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json');
}

function isAuthRedirectResponse(response: Response) {
  if (!response.redirected || isJsonResponse(response)) {
    return false;
  }

  try {
    const url = new URL(response.url);
    const path = url.pathname.toLowerCase();

    return (
      path.includes('/login') ||
      path.includes('/signin') ||
      path.startsWith('/api/auth/')
    );
  } catch {
    return false;
  }
}

export async function requestServerApi<T>(path: string, init?: RequestInit) {
  const response = await requestServerResponse(path, init);
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (isAuthRedirectResponse(response)) {
    throw new ServerApiError('Unauthorized', 401);
  }

  if (!response.ok || !body?.ok) {
    throw new ServerApiError(
      body && !body.ok ? body.error : 'Request failed',
      response.status || 500,
    );
  }

  return body.data;
}
