import type { Impit } from 'impit';
import { NativeError } from './reverse-core.ts';
import { classifyProxyFailure, PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';
import { describeApiExchange } from './api-diagnostics.ts';

export type NativeHttpRequest = {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
};

export type NativeHttpResponse = {
  status: number;
  body: string;
  headers: Headers;
  setCookies: string[];
  bytes: number;
};

export async function nativeHttpRequest(
  client: Impit,
  request: NativeHttpRequest,
  signal: AbortSignal,
  allow: (url: URL, method: string) => boolean,
  timeoutMs = PROXY_REQUEST_TIMEOUT_MS,
  maxResponseBytes = 12 * 1024 * 1024,
): Promise<NativeHttpResponse> {
  if (
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    maxResponseBytes > 48 * 1024 * 1024
  )
    throw new NativeError('INVALID_INPUT', '响应大小上限无效');
  const u = new URL(request.url);
  if (u.protocol !== 'https:' || u.username || u.password || !allow(u, request.method))
    throw new NativeError('INVALID_INPUT', '目标地址不在允许的平台接口中');
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  let response: Awaited<ReturnType<Impit['fetch']>>;
  try {
    response = await client.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: requestSignal,
      redirect: 'manual',
    });
  } catch (error) {
    if (error instanceof NativeError) throw error;
    throw new NativeError(
      requestSignal.aborted ? 'CANCELLED' : classifyProxyFailure(error, requestSignal.aborted),
      '平台请求失败',
      { cause: error },
    );
  }
  let headers: Headers;
  try {
    headers = new Headers(response.headers);
  } catch {
    headers = new Headers();
    const entries =
      response.headers && typeof response.headers.entries === 'function'
        ? response.headers.entries()
        : [];
    for (const [name, value] of entries) {
      if (typeof name === 'string' && typeof value === 'string') {
        try {
          headers.append(name, value);
        } catch {
          // Drop one unusable header. The status and body still describe the response.
        }
      }
    }
  }
  const bodyStream = response.body as
    (ReadableStream<Uint8Array> & AsyncIterable<Uint8Array | Buffer>) | null | undefined;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const push = (value: Uint8Array) => {
    bytes += value.length;
    if (bytes > maxResponseBytes) throw new NativeError('RESPONSE_TOO_LARGE', '响应超过读取上限');
    chunks.push(value);
  };
  try {
    if (bodyStream && typeof bodyStream.getReader === 'function') {
      const reader = bodyStream.getReader();
      try {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          push(r.value);
        }
      } finally {
        reader.releaseLock();
      }
    } else if (bodyStream && typeof bodyStream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of bodyStream) {
        push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    } else if (bodyStream) {
      throw new NativeError('SCHEMA_CHANGED', '响应体无法读取');
    }
  } catch (error) {
    if (error instanceof NativeError) throw error;
    throw new NativeError(
      requestSignal.aborted ? 'CANCELLED' : classifyProxyFailure(error, requestSignal.aborted),
      '平台请求失败',
      { cause: error },
    );
  }
  const body = Buffer.concat(chunks).toString('utf8');
  void describeApiExchange(request.url, response as unknown as Response, body);
  return {
    status: response.status,
    body,
    headers,
    setCookies: typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [],
    bytes,
  };
}

export function instagramUrlAllowed(url: URL, method: string) {
  return (
    url.origin === 'https://www.instagram.com' &&
    ((['/api/graphql', '/graphql/query'].includes(url.pathname) && method === 'POST') ||
      (method === 'GET' && url.pathname === '/') ||
      (/^\/api\/v1\/media\/\d+\/info\/$/.test(url.pathname) && method === 'GET'))
  );
}

export function facebookUrlAllowed(url: URL, method: string) {
  return (
    url.origin === 'https://www.facebook.com' &&
    method === 'POST' &&
    /^\/api\/graphql\/?$/.test(url.pathname) &&
    !url.search
  );
}
