import type { Dispatcher } from 'undici';
import { apiBrowserHeaders, describeApiExchange } from './api-diagnostics.ts';
import {
  browserEnvironment,
  type BrowserEnvironment,
} from './contracts/browser-environment.ts';
import { accountProxyAgent, ProxyConnectionError } from './proxy-agent.ts';
import { accountUpstream, SystemProxyError } from './system-proxy.ts';
import { poolProxy, type PoolProxy } from './contracts/cookie-pool.ts';
import {
  LabError,
  type Query,
  type SdkAuxiliaryRequest,
  type Transport,
  type TransportResult,
} from './reverse-core.ts';
import { PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';

const INSTAGRAM_APP_ID = '936619743392459';
type BrowserPage = {
  url(): string;
  evaluate<T>(pageFunction: (arg: { url: string; maxBytes: number }) => T, arg: { url: string; maxBytes: number }): Promise<T>;
};

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const signatureKeys = /^(x-bogus|x-gnarly|x-dynosaur|_signature)$/i;
export type SessionInput = {
  cookie: string;
  proxy?: PoolProxy;
  mainUrl?: string;
  replyUrl?: string;
  userAgent?: string;
  browserEnvironment?: BrowserEnvironment;
};
export function validateSession(value: unknown): SessionInput {
  if (!value || typeof value !== 'object') throw new LabError('INVALID_SESSION_INPUT');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (key) =>
        !['cookie', 'mainUrl', 'replyUrl', 'userAgent', 'proxy', 'browserEnvironment'].includes(
          key,
        ),
    )
  )
    throw new LabError('INVALID_SESSION_INPUT');
  if (typeof v.cookie !== 'string' || !v.cookie.trim() || /[\r\n]/.test(v.cookie))
    throw new LabError('INVALID_COOKIE');
  for (const key of ['mainUrl', 'replyUrl', 'userAgent'])
    if (v[key] !== undefined && (typeof v[key] !== 'string' || /[\r\n]/.test(v[key])))
      throw new LabError('INVALID_SESSION_INPUT');
  if (v.proxy !== undefined && !poolProxy.safeParse(v.proxy).success)
    throw new LabError('INVALID_PROXY');
  if (
    v.browserEnvironment !== undefined &&
    !browserEnvironment.safeParse(v.browserEnvironment).success
  )
    throw new LabError('INVALID_BROWSER_ENVIRONMENT');
  const input = v as SessionInput;
  if (input.mainUrl) validateUrl(input.mainUrl, false);
  if (input.replyUrl) validateUrl(input.replyUrl, true);
  return input;
}
function validateUrl(value: string, reply: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LabError('INVALID_TEMPLATE_URL');
  }
  if (
    url.origin !== 'https://www.tiktok.com' ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== (reply ? '/api/comment/list/reply/' : '/api/comment/list/')
  )
    throw new LabError('INVALID_TEMPLATE_URL');
  return url;
}
export function requestUrl(
  query: Query,
  input: Pick<SessionInput, 'mainUrl' | 'replyUrl'>,
): string {
  const reply = query.parentId !== null;
  let template = reply ? input.replyUrl : input.mainUrl;
  if (reply && !template && input.mainUrl) {
    const inherited = validateUrl(input.mainUrl, false);
    inherited.pathname = '/api/comment/list/reply/';
    inherited.searchParams.set('count', '3');
    template = inherited.toString();
  }
  const url = template
    ? validateUrl(template, reply)
    : new URL(reply ? '/api/comment/list/reply/' : '/api/comment/list/', 'https://www.tiktok.com');
  if (
    !/^\d+$/.test(query.videoId) ||
    !/^\d+$/.test(query.cursor) ||
    (query.parentId !== null && !/^\d+$/.test(query.parentId))
  )
    throw new LabError('INVALID_QUERY');
  for (const key of [...url.searchParams.keys()])
    if (signatureKeys.test(key)) url.searchParams.delete(key);
  url.searchParams.set('cursor', query.cursor);
  if (!url.searchParams.has('count')) url.searchParams.set('count', reply ? '3' : '20');
  if (reply) {
    url.searchParams.delete('aweme_id');
    url.searchParams.set('item_id', query.videoId);
    url.searchParams.set('comment_id', query.parentId!);
  } else {
    url.searchParams.delete('item_id');
    url.searchParams.delete('comment_id');
    url.searchParams.set('aweme_id', query.videoId);
  }
  return url.toString();
}
export async function limitedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new LabError('BODY_TOO_LARGE');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function httpTransport(
  input: SessionInput,
  cookieForUrl?: (url: string) => string,
): Transport {
  return (query, signal) => proxyApiGet(input, requestUrl(query, input), signal, cookieForUrl);
}

const apiGetPaths = [
  '/api/comment/list/',
  '/api/comment/list/reply/',
  '/api/search/general/full/',
  '/passport/web/account/info/',
  '/tiktokstudio/api/web/user',
  '/aweme/v2/data/insight/',
];
const apiPostPaths = ['/tiktok/creator/manage/item_list/v1/'];
const studioPaths = new Set([
  '/tiktokstudio/api/web/user',
  '/tiktok/creator/manage/item_list/v1/',
  '/aweme/v2/data/insight/',
]);

function allowedApiTarget(url: URL, method: string, documentRequest: boolean) {
  if (url.username || url.password || url.hash || (method !== 'GET' && method !== 'POST'))
    return false;
  if (url.origin === 'https://www.instagram.com')
    return (
      !documentRequest &&
      method === 'GET' &&
      (url.pathname === '/api/v1/accounts/current_user/' ||
        url.pathname === '/api/v1/accounts/edit/web_form_data/')
    );
  if (url.origin !== 'https://www.tiktok.com') return false;
  if (documentRequest) return method === 'GET' && url.pathname === '/search';
  return (method === 'GET' ? apiGetPaths : apiPostPaths).includes(url.pathname);
}

function instagramRequestHeaders(url: URL, cookie: string): Record<string, string> {
  if (url.origin !== 'https://www.instagram.com') return {};
  const headers: Record<string, string> = {
    origin: 'https://www.instagram.com',
    referer: 'https://www.instagram.com/',
    'x-ig-app-id': INSTAGRAM_APP_ID,
    'x-requested-with': 'XMLHttpRequest',
    'x-ig-www-claim': '0',
  };
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('csrftoken='))
    ?.slice('csrftoken='.length);
  if (token && /^[\x21-\x7e]{1,2048}$/.test(token)) headers['x-csrftoken'] = token;
  return headers;
}

function studioRequestHeaders(pathname: string, cookie: string): Record<string, string> {
  if (!studioPaths.has(pathname)) return {};
  const headers: Record<string, string> = {
    origin: 'https://www.tiktok.com',
    referer: 'https://www.tiktok.com/tiktokstudio/content',
  };
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('tt_csrf_token='))
    ?.slice('tt_csrf_token='.length);
  if (token && /^[\x21-\x7e]{1,2048}$/.test(token)) headers['tt-csrf-token'] = token;
  return headers;
}

// Shared proxy-only wire path. Every caller validates its endpoint before sending credentials.
export async function proxyApiGet(
  input: SessionInput,
  target: string,
  signal: AbortSignal,
  cookieForUrl?: (url: string) => string,
  receiveResponse?: (response: {
    status: number;
    text: string;
    headers: Record<string, string>;
    setCookies?: string[];
  }) => Promise<void>,
  sharedDispatcher?: Dispatcher,
): Promise<TransportResult> {
  return proxyGet(input, target, signal, cookieForUrl, receiveResponse, sharedDispatcher, false);
}

export async function proxyApiExchange(
  input: SessionInput,
  request: { url: string; method?: 'GET' | 'POST'; body?: unknown },
  signal: AbortSignal,
  cookieForUrl?: (url: string) => string,
  receiveResponse?: Parameters<typeof proxyApiGet>[4],
  sharedDispatcher?: Dispatcher,
): Promise<TransportResult> {
  return proxyGet(
    input,
    request.url,
    signal,
    cookieForUrl,
    receiveResponse,
    sharedDispatcher,
    false,
    request.method ?? 'GET',
    request.body,
  );
}

// Document bootstrap is a separate allowlist; the API transport cannot navigate arbitrary URLs.
export function proxyDocumentGet(
  input: SessionInput,
  target: string,
  signal: AbortSignal,
  sharedDispatcher?: Dispatcher,
): Promise<TransportResult> {
  return proxyGet(input, target, signal, undefined, undefined, sharedDispatcher, true);
}

// SDK-generated exchanges only. No TikTok login Cookie or arbitrary destination
// is forwarded to this separate, observed first-party SDK origin.
export async function proxySdkExchange(
  input: Omit<SessionInput, 'cookie'>,
  request: SdkAuxiliaryRequest,
  signal: AbortSignal,
  sharedDispatcher?: Dispatcher,
) {
  const url = new URL(request.url);
  const sdkScript =
    url.href ===
      'https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/webmssdk_ex/2.0.0.1667/webmssdk_ex.js' &&
    request.method === 'GET';
  if (
    (!sdkScript &&
      !['https://mssdk.tiktokw.us', 'https://mssdk-va.tiktok.com'].includes(url.origin)) ||
    url.username ||
    url.password ||
    url.hash ||
    !(
      sdkScript ||
      (request.method === 'GET' && url.pathname === '/web/resource') ||
      (request.method === 'POST' && url.pathname === '/web/report')
    ) ||
    (request.body !== null &&
      (typeof request.body !== 'string' || Buffer.byteLength(request.body) > 128 * 1024))
  )
    throw new LabError('INVALID_SDK_TARGET');
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS)]);
  let agent: ReturnType<typeof accountProxyAgent> | undefined;
  try {
    if (!input.proxy) throw new LabError('PROXY_REQUIRED');
    if (!sharedDispatcher)
      agent = accountProxyAgent(
        input.proxy,
        requestSignal,
        await accountUpstream(new URL(input.proxy.url)),
      );
    const response = await fetch(url, {
      method: request.method,
      body: request.method === 'POST' ? request.body : null,
      headers: {
        ...apiBrowserHeaders(input),
        origin: 'https://www.tiktok.com',
        referer: 'https://www.tiktok.com/',
        ...(request.headers['content-type']
          ? { 'content-type': request.headers['content-type'] }
          : {}),
      },
      dispatcher: sharedDispatcher ?? agent!.dispatcher,
      redirect: 'manual',
      signal: requestSignal,
    } as RequestInit & { dispatcher: Dispatcher });
    return {
      status: response.status,
      text: await limitedText(response),
      headers: Object.fromEntries([...response.headers].filter(([name]) => name !== 'set-cookie')),
      setCookies: response.headers.getSetCookie(),
    };
  } catch (error) {
    if (error instanceof LabError) throw error;
    const cause = error instanceof Error ? error.cause : undefined;
    if (
      !requestSignal.aborted &&
      (cause instanceof ProxyConnectionError || cause instanceof SystemProxyError)
    )
      throw new LabError(cause.message);
    throw new LabError(requestSignal.aborted ? 'REQUEST_ABORTED' : 'PROXY_REQUEST_FAILED');
  } finally {
    await agent?.close();
  }
}

async function proxyGet(
  input: SessionInput,
  target: string,
  signal: AbortSignal,
  cookieForUrl: ((url: string) => string) | undefined,
  receiveResponse: Parameters<typeof proxyApiGet>[4],
  sharedDispatcher: Dispatcher | undefined,
  documentRequest: boolean,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<TransportResult> {
  const targetUrl = new URL(target);
  if (!allowedApiTarget(targetUrl, method, documentRequest))
    throw new LabError('INVALID_API_TARGET');
  let payload: string | undefined;
  if (method === 'POST') {
    if (body === undefined || typeof body !== 'object') throw new LabError('INVALID_API_BODY');
    payload = JSON.stringify(body);
    if (Buffer.byteLength(payload) > 64 * 1024) throw new LabError('INVALID_API_BODY');
  } else if (body !== undefined) throw new LabError('INVALID_API_BODY');
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS)]);
  let agent: ReturnType<typeof accountProxyAgent> | undefined;
  try {
    if (!input.proxy) throw new LabError('PROXY_REQUIRED');
    const parsed = poolProxy.safeParse(input.proxy);
    if (!parsed.success) throw new LabError('INVALID_PROXY');
    const proxy = parsed.data;
    const browserHeaders = apiBrowserHeaders(input);
    if (!sharedDispatcher) {
      const upstream = await accountUpstream(new URL(proxy.url));
      requestSignal.throwIfAborted();
      agent = accountProxyAgent(proxy, requestSignal, upstream);
    }
    const url = targetUrl.toString();
    const cookie = cookieForUrl ? cookieForUrl(url) : input.cookie;
    if (!cookie) throw new LabError('COOKIE_ACCOUNT_EXPIRED');
    const response = await fetch(url, {
      dispatcher: sharedDispatcher ?? agent!.dispatcher,
      method,
      body: payload,
      headers: {
        cookie,
        accept: documentRequest ? 'text/html' : 'application/json',
        ...browserHeaders,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...studioRequestHeaders(targetUrl.pathname, cookie),
        ...instagramRequestHeaders(targetUrl, cookie),
      },
      redirect: 'manual',
      signal: requestSignal,
    } as RequestInit & { dispatcher: Dispatcher });
    const text = await limitedText(response);
    // Private SDK feedback channel. These headers must never enter diagnostic artifacts.
    if (receiveResponse)
      await receiveResponse({
        status: response.status,
        text,
        headers: Object.fromEntries([...response.headers].filter(([key]) => key !== 'set-cookie')),
        setCookies: response.headers.getSetCookie(),
      });
    return { status: response.status, text, exchange: describeApiExchange(url, response, text) };
  } catch (error) {
    if (error instanceof LabError) throw error;
    if (!requestSignal.aborted) {
      const cause = error instanceof Error ? error.cause : undefined;
      const connectionError =
        error instanceof ProxyConnectionError || error instanceof SystemProxyError ? error : cause;
      if (
        connectionError instanceof ProxyConnectionError ||
        connectionError instanceof SystemProxyError
      )
        throw new LabError(connectionError.message);
    }
    throw new LabError(requestSignal.aborted ? 'REQUEST_ABORTED' : 'PROXY_REQUEST_FAILED');
  } finally {
    await agent?.close().catch(() => {});
  }
}

// An existing runtime-owned page must be supplied. No CDP discovery, navigation, click or scroll.
// The CLI supplies a runtime-owned exclusive experimental reservation.
export function browserTransport(
  page: BrowserPage,
  templates: Pick<SessionInput, 'mainUrl' | 'replyUrl'>,
): Transport {
  return async (query, signal) => {
    signal.throwIfAborted();
    if (new URL(page.url()).origin !== 'https://www.tiktok.com')
      throw new LabError('TIKTOK_PAGE_REQUIRED');
    const prepared = new URL(requestUrl(query, templates));
    // The live SDK appends fresh token/signatures. Do not duplicate template values.
    prepared.searchParams.delete('msToken');
    return browserPageFetch(page, prepared.toString(), signal);
  };
}

export async function browserPageFetch(
  page: BrowserPage,
  target: string,
  signal: AbortSignal,
) {
  const prepared = new URL(target);
  if (
    prepared.origin !== 'https://www.tiktok.com' ||
    !!prepared.username ||
    !!prepared.password ||
    !!prepared.hash ||
    ![
      '/api/comment/list/',
      '/api/comment/list/reply/',
      '/api/post/item_list/',
      '/api/search/general/full/',
    ].includes(prepared.pathname)
  )
    throw new LabError('INVALID_API_TARGET');
  if (new URL(page.url()).origin !== prepared.origin) throw new LabError('TIKTOK_PAGE_REQUIRED');
  signal.throwIfAborted();
  const result = await page.evaluate(
    async ({ url, maxBytes }) => {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        const reader = response.body?.getReader();
        let text = '',
          size = 0;
        const decoder = new TextDecoder();
        if (reader) {
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > maxBytes)
                return { status: response.status, text: '', error: 'BODY_TOO_LARGE' };
              text += decoder.decode(part.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            await reader.cancel().catch(() => {});
          }
        }
        return { status: response.status, text, error: null };
      } catch {
        return { status: 0, text: '', error: 'BROWSER_REQUEST_FAILED' };
      }
    },
    { url: prepared.toString(), maxBytes: MAX_BODY_BYTES },
  );
  signal.throwIfAborted();
  if (result.error) throw new LabError(result.error);
  return result;
}

export function artifactScrubber(input: SessionInput) {
  const secrets = new Set<string>([
    input.cookie,
    input.proxy?.url ?? '',
    input.proxy?.username ?? '',
    input.proxy?.password ?? '',
  ]);
  for (const part of input.cookie.split(';')) {
    const equal = part.indexOf('=');
    if (equal >= 0) {
      const key = part.slice(0, equal).trim();
      const value = part.slice(equal + 1).trim();
      if (/session|token|csrf|auth|passport|sid|uid_tt/i.test(key) || value.length >= 12)
        secrets.add(value);
    }
  }
  for (const value of [input.mainUrl, input.replyUrl]) {
    if (!value) continue;
    for (const [key, item] of new URL(value).searchParams)
      if (/token|signature|bogus|gnarly|dynosaur|cookie|auth|secret|key/i.test(key))
        secrets.add(item);
  }
  const list = [...secrets].filter(Boolean).sort((a, b) => b.length - a.length);
  return (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item !== 'string') return item;
        for (const secret of list) {
          if (secret.length < 8) {
            if (item === secret) item = '[REDACTED]';
          } else item = (item as string).split(secret).join('[REDACTED]');
        }
        return item;
      }),
    ) as unknown;
}
