import { checkKeywordRelevance, type KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Dataset, KeywordInput } from '@datalom/platform-runtime/contracts/index';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { cookieHeader } from '@datalom/platform-runtime/contracts/cookie-pool';
import { apiBrowserHeaders } from '@datalom/platform-runtime/api-diagnostics';
import { openChromeTransport } from '@datalom/platform-runtime/impit-api';
import { NativeError, LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import {
  buildInstagramRequest,
  validateInstagramResult,
  type InstagramCapture,
  type InstagramOperation,
} from './instagram-native.ts';
import { applyResponseCookies, NativeCookieJar } from '@datalom/platform-runtime/instagram-native-cookies';
import { instagramUrlAllowed, nativeHttpRequest } from '@datalom/platform-runtime/native-http';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { aggregate, parseInstagram, type DataRow } from './instagram-parser.ts';
import { pause } from '@datalom/platform-runtime/pause';
import {
  csrfFromCookie,
  instagramCaptureForMedia,
  instagramCaptureForSearchPage,
  instagramGraphqlCaptures,
  parseInstagramPageTokens,
} from './instagram-bootstrap.ts';
import type { GraphqlCapture } from '@datalom/platform-runtime/contracts/cookie-pool';
import type { Impit } from 'impit';

function captureOf(
  captures: Record<string, GraphqlCapture> | undefined,
  operation: InstagramOperation,
): InstagramCapture {
  const value = captures?.[operation];
  if (!value) throw new LabError('GRAPHQL_TEMPLATE_REQUIRED');
  return {
    url: value.url,
    name: value.name,
    docId: value.docId,
    requestBody: value.requestBody,
    requestHeaders: value.requestHeaders,
    method: value.method,
  };
}

async function bootstrapCaptures(
  credential: PoolCredential,
  client: Impit,
  jar: NativeCookieJar,
  signal: AbortSignal,
  evidence: (entry: Record<string, unknown>) => void,
): Promise<Record<string, GraphqlCapture>> {
  const url = 'https://www.instagram.com/';
  const env = apiBrowserHeaders(credential);
  const cookie = jar.header(url) || cookieHeader(credential.cookies, url);
  const csrf = csrfFromCookie(cookie);
  if (!csrf) throw new LabError('LOGIN_REQUIRED');
  const started = Date.now();
  let response;
  try {
    response = await nativeHttpRequest(
      client,
      {
        url,
        method: 'GET',
        headers: {
          accept: 'text/html',
          'user-agent': env['user-agent'],
          cookie,
        },
      },
      signal,
      instagramUrlAllowed,
    );
  } catch (error) {
    evidence({
      kind: 'search-bootstrap',
      httpStatus: null,
      responseBytes: 0,
      durationMs: Date.now() - started,
      source: 'instagram-home-document',
      browserUsed: false,
      error: errorCode(error),
    });
    throw error;
  }
  applyResponseCookies(jar, response.setCookies, url, () => {});
  evidence({
    kind: 'search-bootstrap',
    httpStatus: response.status,
    responseBytes: response.bytes,
    durationMs: Date.now() - started,
    source: 'instagram-home-document',
    browserUsed: false,
  });
  if (response.status !== 200) throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
  if (!response.body.trim()) throw new LabError('SEARCH_BOOTSTRAP_EMPTY');
  return instagramGraphqlCaptures({
    ...parseInstagramPageTokens(response.body),
    csrf: csrfFromCookie(jar.header(url) || cookie) ?? csrf,
  });
}

export async function collectServerInstagramKeyword(opts: {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  credential: PoolCredential;
  signal: AbortSignal;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
}) {
  if (!opts.credential.proxy) throw new LabError('PROXY_REQUIRED');
  const datasets: Partial<Record<Dataset, DataRow[]>> = {
    'instagram.videos': [],
    'instagram.comments': [],
  };
  const counts = () =>
    Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length]));
  let requests = 0;
  let error: string | null = null;
  const jar = new NativeCookieJar();
  for (const cookie of opts.credential.cookies) {
    jar.set(
      `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}${cookie.secure ? '; Secure' : ''}`,
      'https://www.instagram.com/',
    );
  }
  const upstream = await accountUpstream(new URL(opts.credential.proxy.url));
  const chrome = await openChromeTransport(opts.credential.proxy, opts.signal, upstream);
  let counter = opts.credential.requestCounter ?? 0;
  try {
    const captures =
      opts.credential.graphqlCaptures?.['search.media'] &&
      opts.credential.graphqlCaptures['search.media.page']
        ? opts.credential.graphqlCaptures
        : await bootstrapCaptures(opts.credential, chrome.client, jar, opts.signal, opts.evidence);
    const searchCapture = captureOf(captures, 'search.media');
    const pageCapture = captures['search.media.page']
      ? captureOf(captures, 'search.media.page')
      : undefined;
    const commentCapture = captures['post.comments']
      ? captureOf(captures, 'post.comments')
      : undefined;
    const seen = new Set<string>();
    let cursor: string | null = null;
    let first = true;
    while (datasets['instagram.videos']!.length < opts.input.videoLimit) {
      opts.signal.throwIfAborted();
      if (requests >= 100) throw new LabError('PAGE_LIMIT');
      if (!first) await pause(300, opts.signal);
      first = false;
      const operation: InstagramOperation = cursor ? 'search.media.page' : 'search.media';
      const capture =
        operation === 'search.media.page' && pageCapture
          ? instagramCaptureForSearchPage(pageCapture, opts.input.keyword, cursor)
          : searchCapture;
      if (!capture) break;
      const updates: Record<string, unknown> =
        operation === 'search.media' ? { query: opts.input.keyword } : { first: 10 };
      const request = buildInstagramRequest(operation, capture, updates, ++counter);
      const env = apiBrowserHeaders(opts.credential);
      requests++;
      const response = await nativeHttpRequest(
        chrome.client,
        {
          url: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            'user-agent': env['user-agent'],
            cookie: jar.header(request.url) || cookieHeader(opts.credential.cookies, request.url),
          },
          body: request.body,
        },
        opts.signal,
        instagramUrlAllowed,
      );
      applyResponseCookies(jar, response.setCookies, request.url, () => {});
      const result = validateInstagramResult(
        operation,
        request.variables,
        response.status,
        response.body,
      );
      const parsed = parseInstagram(
        { items: result.page?.items ?? result.raw.items },
        new Date().toISOString(),
      );
      const fresh: DataRow[] = [];
      for (const row of parsed?.records ?? []) {
        const key = String(row.videoId);
        if (seen.has(key)) continue;
        seen.add(key);
        if (opts.input.minLikes !== null && row.likes === null)
          throw new NativeError('SCHEMA_CHANGED', 'REQUIRED_LIKES_MISSING');
        row.qualifies = opts.input.minLikes === null || Number(row.likes) > opts.input.minLikes;
        row.rank = datasets['instagram.videos']!.length + 1;
        datasets['instagram.videos']!.push(row);
        fresh.push(row);
        if (datasets['instagram.videos']!.length === opts.input.videoLimit) break;
      }
      opts.progress(counts());
      opts.evidence({
        kind: 'http-exchange',
        path: new URL(request.url).pathname,
        operation,
        request: requests,
        status: response.status,
        bytes: response.bytes,
        count: fresh.length,
      });
      if (!result.page?.hasMore || !pageCapture) break;
      if (!result.page.cursor || result.page.cursor === cursor)
        throw new NativeError('SCHEMA_CHANGED', '分页游标重复，已停止');
      cursor = result.page.cursor;
    }
    if (commentCapture && opts.input.commentsPerVideo > 0) {
      for (const video of datasets['instagram.videos']!.filter((row) => row.qualifies === true)) {
        if (datasets['instagram.comments']!.length >= opts.input.totalComments) break;
        if (!(await checkKeywordRelevance(video, opts.signal, opts.relevance, opts.evidence)))
          continue;
        if (video.commentsCount === 0) continue;
        let commentCursor: string | null = null;
        let videoComments = 0;
        const remaining = () =>
          Math.min(
            opts.input.commentsPerVideo - videoComments,
            opts.input.totalComments - datasets['instagram.comments']!.length,
          );
        while (remaining() > 0) {
          opts.signal.throwIfAborted();
          if (requests >= 100) throw new LabError('PAGE_LIMIT');
          await pause(300, opts.signal);
          const updates: Record<string, unknown> = commentCursor
            ? { after: commentCursor, first: Math.min(10, remaining()) }
            : {};
          const request = buildInstagramRequest(
            'post.comments',
            instagramCaptureForMedia(commentCapture, String(video.videoId)),
            updates,
            ++counter,
          );
          const env = apiBrowserHeaders(opts.credential);
          requests++;
          const response = await nativeHttpRequest(
            chrome.client,
            {
              url: request.url,
              method: request.method,
              headers: {
                ...request.headers,
                'user-agent': env['user-agent'],
                cookie:
                  jar.header(request.url) || cookieHeader(opts.credential.cookies, request.url),
              },
              body: request.body,
            },
            opts.signal,
            instagramUrlAllowed,
          );
          applyResponseCookies(jar, response.setCookies, request.url, () => {});
          const result = validateInstagramResult(
            'post.comments',
            request.variables,
            response.status,
            response.body,
          );
          const parsed = parseInstagram(
            { comments: result.page?.items ?? [] },
            new Date().toISOString(),
            String(video.videoId),
          );
          const batch = (parsed?.records ?? []).slice(0, remaining());
          datasets['instagram.comments']!.push(...batch);
          videoComments += batch.length;
          opts.progress(counts());
          if (!result.page?.hasMore) break;
          commentCursor = result.page.cursor;
          if (!commentCursor) break;
        }
      }
    }
  } catch (cause) {
    error =
      cause instanceof Error && /^[A-Z_]+(?::|$)/.test(cause.message)
        ? cause.message.split(':')[0]
        : errorCode(cause);
    if (error === 'RATE_LIMIT') error = 'RATE_LIMITED';
  } finally {
    await chrome.close();
  }
  const derived = aggregate(datasets['instagram.videos']!, datasets['instagram.comments']!);
  datasets['instagram.users'] = derived.users;
  datasets['instagram.tags'] = derived.tags;
  datasets['instagram.keyword-evidence'] = derived.keywords;
  opts.progress(counts());
  return {
    complete: !error,
    error,
    requests,
    datasets,
    scope: 'configured-keyword-budget-main-comments',
    allPlatformMatchesVerified: false,
  };
}
