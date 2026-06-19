import { NextResponse } from 'next/server';

import { resolveApiUrl } from '@/lib/api-base-url';
import { getAuthorizationHeaderValue } from '@/lib/auth-client';
import { getServerAuthState } from '@/lib/server/auth';
import { fetchUpstream, UpstreamFetchError } from '@/lib/server/upstream-fetch';

interface ProxyRouteContext {
  params: Promise<{
    path?: string[];
  }>;
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function buildProxyPath(path: string[] | undefined, requestUrl: string) {
  const url = new URL(requestUrl);
  const normalizedPath = `/${(path ?? []).map(encodeURIComponent).join('/')}`;

  return `/api${normalizedPath}${url.search}`;
}

function buildForwardHeaders(request: Request) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      !HOP_BY_HOP_HEADERS.has(normalizedKey) &&
      normalizedKey !== 'authorization' &&
      normalizedKey !== 'cookie' &&
      normalizedKey !== 'accept-encoding'
    ) {
      headers.set(key, value);
    }
  });

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  headers.set('accept-encoding', 'identity');

  return headers;
}

function upstreamErrorResponse(error: UpstreamFetchError) {
  return NextResponse.json(
    {
      ok: false,
      error: error.message,
    },
    { status: 502 },
  );
}

async function proxyRequest(request: Request, context: ProxyRouteContext) {
  const { path } = await context.params;
  const headers = buildForwardHeaders(request);
  const authState = await getServerAuthState();
  const authorizationHeader = getAuthorizationHeaderValue(authState);
  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  if (authorizationHeader) {
    headers.set('authorization', authorizationHeader);
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetchUpstream(
      resolveApiUrl(buildProxyPath(path, request.url)),
      {
        method,
        headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
        cache: 'no-store',
      },
    );
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      return upstreamErrorResponse(error);
    }

    throw error;
  }

  const responseHeaders = new Headers();

  upstreamResponse.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (
      !HOP_BY_HOP_HEADERS.has(normalizedKey) &&
      normalizedKey !== 'set-cookie' &&
      normalizedKey !== 'content-encoding'
    ) {
      responseHeaders.set(key, value);
    }
  });

  responseHeaders.set('Cache-Control', 'no-store');

  return new NextResponse(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: ProxyRouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: ProxyRouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: Request, context: ProxyRouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: Request, context: ProxyRouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: ProxyRouteContext) {
  return proxyRequest(request, context);
}
