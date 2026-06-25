import { NextResponse } from 'next/server';
import { getServerAuthState } from '@/lib/server/auth';
import { fetchUpstream, UpstreamFetchError } from '@/lib/server/upstream-fetch';
const PYTHON_API_BASE_URL =
  process.env.PYTHON_BACKEND_URL?.trim() ||
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL?.trim() ||
  'http://127.0.0.1:8000/api/';

function resolvePythonApiUrl(path: string) {
  const normalizedBase = PYTHON_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, `${normalizedBase}/`).toString();
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
  const authState = await getServerAuthState();
  const userId = authState?.user?.id;

  if (!userId) {
    return jsonError('Unauthorized', 401);
  }

  const input = await request.formData();
  const file = input.get('file');

  if (!(file instanceof File)) {
    return jsonError('File is required', 400);
  }

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('user_id', userId);

  let upstreamResponse: Response;
  const upstreamUrl = resolvePythonApiUrl('v1/clean_data');

  // Serialize multipart data once so the request body can be replayed by the
  // HTTP/1.1 transport fallback after an Undici connection timeout.
  const serializedRequest = new Request(upstreamUrl, {
    method: 'POST',
    body: formData,
  });
  const serializedBody = await serializedRequest.arrayBuffer();

  try {
    upstreamResponse = await fetchUpstream(upstreamUrl, {
      method: 'POST',
      headers: serializedRequest.headers,
      body: serializedBody,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      return jsonError(error.message, 502);
    }

    throw error;
  }

  const body = await upstreamResponse.text();

  return new NextResponse(body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: {
      'Content-Type':
        upstreamResponse.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
