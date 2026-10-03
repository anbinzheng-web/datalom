import type { Impit } from 'impit';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { cookieHeader } from '@datalom/platform-runtime/contracts/cookie-pool';
import { apiBrowserHeaders } from '@datalom/platform-runtime/api-diagnostics';
import type { FacebookCapture } from './facebook-native.ts';
import { marketplaceOperations } from './facebook-marketplace.ts';
import { parseInstagramPageTokens } from '@datalom/platform-instagram/api/instagram-bootstrap';
import { NativeCookieJar } from '@datalom/platform-runtime/instagram-native-cookies';
import { nativeHttpRequest } from '@datalom/platform-runtime/native-http';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { facebookVideoSearchName, facebookVideoSearchTemplate } from './facebook-video.ts';

const searchName = marketplaceOperations['marketplace.search'].name;

export function marketplaceDocumentAllowed(url: URL, method: string) {
  return (
    url.origin === 'https://www.facebook.com' &&
    method === 'GET' &&
    /^\/marketplace\/(?:search|\d+\/search)\/$/.test(url.pathname) &&
    [...url.searchParams.keys()].every((key) => key === 'query')
  );
}

export function facebookVideoDocumentAllowed(url: URL, method: string) {
  return (
    url.origin === 'https://www.facebook.com' &&
    method === 'GET' &&
    url.pathname === '/search/videos/' &&
    [...url.searchParams.keys()].every((key) =>
      ['q', '__rsidv2__', '__tsid__', '__epa__', '__eps__'].includes(key),
    )
  );
}

export function marketplaceSearchTemplate(html: string) {
  const marker = `"queryName":"${searchName}"`;
  const at = html.indexOf(marker);
  if (at < 0) throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  const start = html.lastIndexOf('"queryID":"', at);
  const docId =
    start >= 0 && at - start < 20000
      ? html.slice(start + '"queryID":"'.length).match(/^\d+/)?.[0]
      : undefined;
  const varAt = html.indexOf('"variables":', start);
  if (!docId || varAt < 0 || varAt > at) throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  let index = varAt + '"variables":'.length;
  while (html[index] === ' ') index++;
  if (html[index] !== '{') throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  let depth = 0;
  let end = index;
  for (; end < html.length; end++) {
    const char = html[end];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }
  let variables: Record<string, unknown>;
  try {
    variables = JSON.parse(html.slice(index, end));
  } catch {
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  }
  const params = variables.params;
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    !('bqf' in params) ||
    !params.bqf ||
    typeof params.bqf !== 'object' ||
    Array.isArray(params.bqf)
  )
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  return { docId, variables };
}

export async function bootstrapFacebookSearchCapture(options: {
  client: Impit;
  credential: PoolCredential;
  jar: NativeCookieJar;
  keyword: string;
  signal: AbortSignal;
  evidence: (entry: Record<string, unknown>) => void;
}): Promise<FacebookCapture> {
  const started = Date.now();
  const initial = new URL('https://www.facebook.com/marketplace/search/');
  initial.searchParams.set('query', options.keyword);
  const env = apiBrowserHeaders(options.credential);
  const cookie =
    options.jar.header(initial.toString()) ||
    cookieHeader(options.credential.cookies, 'https://www.facebook.com/');
  const load = async (url: string) =>
    nativeHttpRequest(
      options.client,
      {
        url,
        method: 'GET',
        headers: { accept: 'text/html', 'user-agent': env['user-agent'], cookie },
      },
      options.signal,
      marketplaceDocumentAllowed,
      60_000,
    );
  let response;
  let redirected = false;
  try {
    response = await load(initial.toString());
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? new URL(location, initial) : null;
      if (
        !next ||
        next.origin !== 'https://www.facebook.com' ||
        !/^\/marketplace\/(?:search|\d+\/search)\/$/.test(next.pathname)
      )
        throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
      const clean = new URL(`${next.origin}${next.pathname}`);
      clean.searchParams.set('query', options.keyword);
      redirected = true;
      response = await load(clean.toString());
    }
  } catch (error) {
    options.evidence({
      kind: 'search-bootstrap',
      httpStatus: null,
      responseBytes: 0,
      durationMs: Date.now() - started,
      source: 'facebook-marketplace-document',
      browserUsed: false,
      redirected,
      error: errorCode(error),
    });
    throw error;
  }
  options.evidence({
    kind: 'search-bootstrap',
    httpStatus: response.status,
    responseBytes: response.bytes,
    durationMs: Date.now() - started,
    source: 'facebook-marketplace-document',
    browserUsed: false,
    redirected,
  });
  if (response.status !== 200) throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
  const tokens = parseInstagramPageTokens(response.body);
  const template = marketplaceSearchTemplate(response.body);
  const variables = template.variables;
  const params = variables.params as { bqf: { query?: unknown } };
  params.bqf.query = options.keyword;
  variables.savedSearchQuery = options.keyword;
  variables.cursor = null;
  return {
    url: 'https://www.facebook.com/api/graphql/',
    name: searchName,
    docId: template.docId,
    requestHeaders: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://www.facebook.com',
      referer: initial.toString(),
      'x-fb-friendly-name': searchName,
      'x-fb-lsd': tokens.lsd,
    },
    requestBody: new URLSearchParams({
      fb_api_req_friendly_name: searchName,
      doc_id: template.docId,
      fb_dtsg: tokens.dtsg,
      lsd: tokens.lsd,
      __req: 'a',
      variables: JSON.stringify(variables),
    }).toString(),
  };
}

export async function bootstrapFacebookVideoSearchCapture(options: {
  client: Impit;
  credential: PoolCredential;
  jar: NativeCookieJar;
  keyword: string;
  signal: AbortSignal;
  evidence: (entry: Record<string, unknown>) => void;
}): Promise<FacebookCapture> {
  const initial = new URL('https://www.facebook.com/search/videos/');
  initial.searchParams.set('q', options.keyword);
  const env = apiBrowserHeaders(options.credential);
  let response = await nativeHttpRequest(
    options.client,
    {
      url: initial.toString(),
      method: 'GET',
      headers: {
        accept: 'text/html',
        'user-agent': env['user-agent'],
        cookie:
          options.jar.header(initial.toString()) ||
          cookieHeader(options.credential.cookies, initial.toString()),
      },
    },
    options.signal,
    facebookVideoDocumentAllowed,
    60_000,
    32 * 1024 * 1024,
  );
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    const next = location ? new URL(location, initial) : null;
    if (!next || next.origin !== initial.origin || next.pathname !== initial.pathname)
      throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
    next.searchParams.set('q', options.keyword);
    response = await nativeHttpRequest(
      options.client,
      {
        url: next.toString(),
        method: 'GET',
        headers: {
          accept: 'text/html',
          'user-agent': env['user-agent'],
          cookie:
            options.jar.header(next.toString()) ||
            cookieHeader(options.credential.cookies, next.toString()),
        },
      },
      options.signal,
      facebookVideoDocumentAllowed,
      60_000,
      32 * 1024 * 1024,
    );
  }
  options.evidence({
    kind: 'search-bootstrap',
    httpStatus: response.status,
    responseBytes: response.bytes,
    source: 'facebook-video-search-document',
    browserUsed: false,
  });
  if (response.status !== 200) throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
  let tokens: Awaited<ReturnType<typeof parseInstagramPageTokens>>;
  let template: Awaited<ReturnType<typeof facebookVideoSearchTemplate>>;
  try {
    tokens = parseInstagramPageTokens(response.body);
    template = facebookVideoSearchTemplate(response.body);
  } catch (error) {
    options.evidence({
      kind: 'search-bootstrap-parse',
      source: 'facebook-video-search-document',
      error: errorCode(error),
    });
    throw error;
  }
  const variables = template.variables;
  variables.args.text = options.keyword;
  variables.cursor = null;
  return {
    url: 'https://www.facebook.com/api/graphql/',
    name: facebookVideoSearchName,
    docId: template.docId,
    requestHeaders: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://www.facebook.com',
      referer: initial.toString(),
      'x-fb-friendly-name': facebookVideoSearchName,
      'x-fb-lsd': tokens.lsd,
    },
    requestBody: new URLSearchParams({
      fb_api_req_friendly_name: facebookVideoSearchName,
      doc_id: template.docId,
      fb_dtsg: tokens.dtsg,
      lsd: tokens.lsd,
      __req: 'a',
      variables: JSON.stringify(variables),
    }).toString(),
  };
}
