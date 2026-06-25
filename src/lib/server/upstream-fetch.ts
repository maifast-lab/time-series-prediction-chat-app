import http from 'node:http';
import https from 'node:https';

export class UpstreamFetchError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamFetchError';
  }
}

function readErrorRecord(error: unknown) {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : null;
}

function findErrorCode(error: unknown): string | null {
  let current: unknown = error;

  while (current) {
    const record = readErrorRecord(current);
    const code = record?.code;

    if (typeof code === 'string' && code.trim()) {
      return code;
    }

    current = record?.cause;
  }

  return null;
}

function findErrorMessage(error: unknown): string {
  let current: unknown = error;

  while (current) {
    if (current instanceof Error && current.message) {
      return current.message;
    }

    current = readErrorRecord(current)?.cause;
  }

  return 'fetch failed';
}

function isRetryableTransportError(error: unknown) {
  const code = findErrorCode(error);
  const message = findErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  return (
    code === 'ERR_HTTP2_STREAM_ERROR' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code?.startsWith('NGHTTP2_') ||
    message.includes('NGHTTP2_') ||
    normalizedMessage.includes('http2 stream') ||
    normalizedMessage.includes('connect timeout')
  );
}

function describeFetchError(error: unknown) {
  const code = findErrorCode(error);
  const message = findErrorMessage(error);

  return code ? `${message} (${code})` : message;
}

function normalizeAbortReason(reason: unknown) {
  return reason instanceof Error ? reason : new Error('Request aborted');
}

async function normalizeBody(body: BodyInit | null | undefined) {
  if (body == null) {
    return undefined;
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString());
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }

  throw new TypeError(
    'HTTP/1.1 fallback does not support this request body type',
  );
}

function copyResponseHeaders(
  source: http.IncomingHttpHeaders,
  target: Headers,
) {
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => target.append(key, item));
      return;
    }

    target.set(key, value);
  });
}

async function fetchOverHttp1(url: URL, init?: RequestInit) {
  const body = await normalizeBody(init?.body);
  const headers = new Headers(init?.headers);

  headers.set('connection', 'close');
  headers.set('accept-encoding', 'identity');

  if (body && !headers.has('content-length')) {
    headers.set('content-length', String(body.byteLength));
  }

  const client = url.protocol === 'http:' ? http : https;

  return await new Promise<Response>((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(headers.entries()),
        agent: false,
      },
      (incoming) => {
        const chunks: Buffer[] = [];

        incoming.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        incoming.on('error', reject);
        incoming.on('end', () => {
          const responseHeaders = new Headers();
          copyResponseHeaders(incoming.headers, responseHeaders);

          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode ?? 502,
              statusText: incoming.statusMessage,
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    request.on('error', reject);

    const signal = init?.signal;

    if (signal) {
      if (signal.aborted) {
        request.destroy(normalizeAbortReason(signal.reason));
        return;
      }

      signal.addEventListener(
        'abort',
        () => request.destroy(normalizeAbortReason(signal.reason)),
        { once: true },
      );
    }

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

export async function fetchUpstream(input: string | URL, init?: RequestInit) {
  const url = new URL(input);

  try {
    return await fetch(url, init);
  } catch (error) {
    if (
      isRetryableTransportError(error) &&
      ['http:', 'https:'].includes(url.protocol)
    ) {
      try {
        return await fetchOverHttp1(url, init);
      } catch (fallbackError) {
        throw new UpstreamFetchError(
          `Could not reach upstream API. ${describeFetchError(fallbackError)}`,
          fallbackError,
        );
      }
    }

    throw new UpstreamFetchError(
      `Could not reach upstream API. ${describeFetchError(error)}`,
      error,
    );
  }
}
