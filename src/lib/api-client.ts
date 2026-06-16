import type { ApiEnvelope } from '@/lib/api-response';

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

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const url = path;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (error) {
    throw new ApiClientError(
      `Could not reach API at ${url}. Check that the application server is running.`,
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
