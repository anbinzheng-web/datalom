import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Impit as ImpitClient } from 'impit';
import { apiBrowserHeaders, describeApiExchange } from './api-diagnostics.ts';
import { LabError, type TransportResult } from './reverse-core.ts';
import { limitedText, type SessionInput } from './reverse-transports.ts';
import type { PoolProxy } from './contracts/cookie-pool.ts';
import { PROXY_REQUEST_TIMEOUT_MS, classifyProxyFailure } from './proxy-timeout.ts';
import { startAccountHttpBridge, type ProxyBridgeEvent } from './local-http-bridge.ts';

type ImpitModule = typeof import('impit');

async function loadImpit(): Promise<ImpitModule> {
  const modules = process.env.CRAWLER_DEPENDENCIES_DIR;
  return modules
    ? import(pathToFileURL(join(modules, 'impit/index.wrapper.js')).href)
    : import('impit');
}

function commentHeaders(input: SessionInput, keyword?: string) {
  return {
    ...apiBrowserHeaders(input),
    accept: 'application/json, text/plain, */*',
    origin: 'https://www.tiktok.com',
    referer: keyword
      ? `https://www.tiktok.com/search?${new URLSearchParams({ lang: 'en', q: keyword, t: '0' })}`
      : 'https://www.tiktok.com/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
  };
}

export async function openChromeTransport(
  proxy: PoolProxy,
  signal: AbortSignal,
  upstream?: URL,
  timeout = PROXY_REQUEST_TIMEOUT_MS,
  observe?: Parameters<typeof startAccountHttpBridge>[3],
) {
  let failure: ProxyBridgeEvent | undefined;
  const bridge = await startAccountHttpBridge(proxy, signal, upstream, (entry) => {
    if (entry.error) failure = entry;
    observe?.(entry);
  });
  try {
    const { Impit } = await loadImpit();
    return {
      client: new Impit({
        browser: 'chrome151',
        proxyUrl: bridge.url,
        http3: false,
        followRedirects: false,
        vanillaFallback: false,
        // node:test installs a fixture CA on Node's store; Impit uses the OS trust store.
        ignoreTlsErrors: process.env.NODE_TEST_CONTEXT != null,
        timeout,
      }),
      close: bridge.close,
      takeProxyFailure: () => {
        const value = failure;
        failure = undefined;
        return value;
      },
    };
  } catch (error) {
    await bridge.close();
    throw error;
  }
}

export async function proxyChromeGet(
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
  extras?: { keyword?: string; client?: ImpitClient },
): Promise<TransportResult> {
  const targetUrl = new URL(target);
  if (
    targetUrl.origin !== 'https://www.tiktok.com' ||
    targetUrl.username ||
    targetUrl.password ||
    targetUrl.hash ||
    !['/api/comment/list/', '/api/comment/list/reply/'].includes(targetUrl.pathname)
  )
    throw new LabError('INVALID_API_TARGET');
  if (!input.proxy) throw new LabError('PROXY_REQUIRED');
  const cookie = cookieForUrl ? cookieForUrl(target) : input.cookie;
  if (!cookie) throw new LabError('COOKIE_ACCOUNT_EXPIRED');
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS)]);
  if (!extras?.client) throw new LabError('PROXY_REQUIRED');
  const client = extras.client;
  let response: Awaited<ReturnType<ImpitClient['fetch']>>;
  try {
    response = await client.fetch(target, {
      method: 'GET',
      headers: {
        cookie,
        ...commentHeaders(input, extras?.keyword),
      },
      redirect: 'manual',
      signal: requestSignal,
      timeout: PROXY_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof LabError) throw error;
    throw new LabError(classifyProxyFailure(error, requestSignal.aborted));
  }
  const text = await limitedText(response as unknown as Response);
  const headers = Object.fromEntries(
    [...response.headers].filter(([name]) => name !== 'set-cookie'),
  );
  const setCookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (receiveResponse)
    await receiveResponse({
      status: response.status,
      text,
      headers,
      setCookies,
    });
  return {
    status: response.status,
    text,
    exchange: describeApiExchange(target, response as unknown as Response, text),
  };
}
