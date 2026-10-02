import { checkKeywordRelevance, type KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Dataset, KeywordInput } from '@datalom/platform-runtime/contracts/index';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { cookieHeader } from '@datalom/platform-runtime/contracts/cookie-pool';
import { apiBrowserHeaders } from '@datalom/platform-runtime/api-diagnostics';
import { openChromeTransport } from '@datalom/platform-runtime/impit-api';
import { NativeError, LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { facebookUrlAllowed, nativeHttpRequest } from '@datalom/platform-runtime/native-http';
import { applyResponseCookies, NativeCookieJar } from '@datalom/platform-runtime/instagram-native-cookies';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { pause } from '@datalom/platform-runtime/pause';
import { buildFacebookVideoSearch, parseFacebookVideoSearch } from './facebook-video.ts';
import {
  facebookCommentRequest,
  parseFacebookComments,
  aggregateFacebook,
  type FacebookCommentTarget,
} from './facebook-comments.ts';
import { bootstrapFacebookVideoSearchCapture } from './facebook-bootstrap.ts';

export async function collectServerFacebookKeyword(opts: {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  credential: PoolCredential;
  signal: AbortSignal;
  maxPages?: number;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
}) {
  if (!opts.credential.proxy) throw new LabError('PROXY_REQUIRED');
  const datasets: Partial<Record<Dataset, Record<string, unknown>[]>> = {
    'facebook.videos': [],
    'facebook.comments': [],
  };
  const counts = () =>
    Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length]));
  const maxPages = opts.maxPages ?? 100;
  let requests = 0;
  let error: string | null = null;
  let stage = 'search-bootstrap';
  const jar = new NativeCookieJar();
  for (const cookie of opts.credential.cookies) {
    jar.set(
      `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}${cookie.secure ? '; Secure' : ''}`,
      'https://www.facebook.com/',
    );
  }
  const upstream = await accountUpstream(new URL(opts.credential.proxy.url));
  const chrome = await openChromeTransport(opts.credential.proxy, opts.signal, upstream, 60_000);
  let counter = opts.credential.requestCounter ?? 0;
  try {
    const capture = await bootstrapFacebookVideoSearchCapture({
      client: chrome.client,
      credential: opts.credential,
      jar,
      keyword: opts.input.keyword,
      signal: opts.signal,
      evidence: opts.evidence,
    });
    stage = 'video-search';
    const seen = new Set<string>();
    let cursor: string | null = null;
    let first = true;
    while (datasets['facebook.videos']!.length < opts.input.videoLimit) {
      opts.signal.throwIfAborted();
      if (requests >= maxPages) throw new LabError('PAGE_LIMIT');
      if (!first) await pause(300, opts.signal);
      first = false;
      const request = buildFacebookVideoSearch(capture, opts.input.keyword, cursor, ++counter);
      const env = apiBrowserHeaders(opts.credential);
      requests++;
      const response = await nativeHttpRequest(
        chrome.client,
        {
          url: request.url,
          method: 'POST',
          headers: {
            ...request.headers,
            'user-agent': env['user-agent'],
            cookie: jar.header(request.url) || cookieHeader(opts.credential.cookies, request.url),
          },
          body: request.body,
        },
        opts.signal,
        facebookUrlAllowed,
        60_000,
        32 * 1024 * 1024,
      );
      applyResponseCookies(jar, response.setCookies, request.url, () => {});
      const result = parseFacebookVideoSearch(response.status, response.body);
      const fresh: Record<string, unknown>[] = [];
      for (const item of result.items) {
        const id = String(item.videoId ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (opts.input.minLikes !== null && item.likes === null)
          throw new NativeError('SCHEMA_CHANGED', 'REQUIRED_LIKES_MISSING');
        const row = {
          qualifies: opts.input.minLikes === null || Number(item.likes) > opts.input.minLikes,
          ...item,
          rank: datasets['facebook.videos']!.length + 1,
          observedAt: new Date().toISOString(),
        };
        datasets['facebook.videos']!.push(row);
        fresh.push(row);
        if (datasets['facebook.videos']!.length === opts.input.videoLimit) break;
      }
      opts.progress(counts());
      opts.evidence({
        kind: 'http-exchange',
        path: new URL(request.url).pathname,
        operation: 'video-search',
        request: requests,
        status: response.status,
        bytes: response.bytes,
        count: fresh.length,
      });
      if (!result.hasMore) break;
      if (!result.cursor || result.cursor === cursor)
        throw new NativeError('SCHEMA_CHANGED', '分页游标重复，已停止');
      cursor = result.cursor;
    }
    stage = 'comments';
    const commentSeen = new Set<string>();
    const fetchComments = async (
      target: FacebookCommentTarget,
      cursor: string | null,
      detail = false,
    ) => {
      opts.signal.throwIfAborted();
      if (requests >= maxPages) throw new LabError('PAGE_LIMIT');
      await pause(300, opts.signal);
      const request = facebookCommentRequest(capture, target, cursor, ++counter, detail);
      requests++;
      const response = await nativeHttpRequest(
        chrome.client,
        {
          url: request.url,
          method: 'POST',
          headers: {
            ...request.headers,
            'user-agent': apiBrowserHeaders(opts.credential)['user-agent'],
            cookie: jar.header(request.url),
          },
          body: request.body,
        },
        opts.signal,
        facebookUrlAllowed,
        60_000,
        32 * 1024 * 1024,
      );
      applyResponseCookies(jar, response.setCookies, request.url, () => {});
      const result = parseFacebookComments(
        request.operation,
        request.variables,
        response.status,
        response.body,
        target,
      );
      opts.evidence({
        kind: 'http-exchange',
        operation: request.operation,
        videoId: target.videoId,
        request: requests,
        status: response.status,
        bytes: response.bytes,
        count: result.rows.length,
        hasMore: result.hasMore,
        filtering: result.filtering,
      });
      return result;
    };
    if (opts.input.commentsPerVideo > 0 && opts.input.totalComments > 0) {
      for (const video of datasets['facebook.videos']!.filter((row) => row.qualifies === true)) {
        if (datasets['facebook.comments']!.length >= opts.input.totalComments) break;
        if (!(await checkKeywordRelevance(video, opts.signal, opts.relevance, opts.evidence)))
          continue;
        if (video.commentsCount === 0) continue;
        let perVideo = 0;
        const remaining = () =>
          Math.min(
            opts.input.commentsPerVideo - perVideo,
            opts.input.totalComments - datasets['facebook.comments']!.length,
          );
        const save = (rows: Record<string, unknown>[]) => {
          for (const row of rows) {
            if (remaining() <= 0) break;
            const id = String(row.commentId);
            if (commentSeen.has(id)) continue;
            commentSeen.add(id);
            datasets['facebook.comments']!.push(row);
            perVideo++;
          }
          opts.progress(counts());
        };
        const target: FacebookCommentTarget = {
          videoId: String(video.videoId),
          feedbackId: '',
          parentCommentId: null,
        };
        let page = await fetchComments(target, null, true);
        target.feedbackId = page.feedbackId;
        if (page.allCommentsIntent) {
          target.intentToken = page.allCommentsIntent;
          page = await fetchComments(target, null);
        }
        const cursors = new Set<string>();
        while (remaining() > 0) {
          save(page.rows);
          for (const replyTarget of page.replyTargets) {
            if (remaining() <= 0) break;
            let replyCursor: string | null = null;
            const replyCursors = new Set<string>();
            while (remaining() > 0) {
              const replies = await fetchComments(replyTarget, replyCursor);
              save(replies.rows);
              if (!replies.hasMore || remaining() <= 0) break;
              if (!replies.cursor || replyCursors.has(replies.cursor))
                throw new NativeError('SCHEMA_CHANGED', '回复分页游标重复');
              replyCursors.add(replies.cursor);
              replyCursor = replies.cursor;
            }
          }
          if (!page.hasMore || remaining() <= 0) break;
          if (!page.cursor || cursors.has(page.cursor))
            throw new NativeError('SCHEMA_CHANGED', '评论分页游标重复');
          cursors.add(page.cursor);
          page = await fetchComments(target, page.cursor);
        }
        opts.evidence({
          kind: 'comments-completed',
          videoId: target.videoId,
          count: perVideo,
          stopReason: remaining() <= 0 ? 'budget' : 'exhausted',
        });
      }
    }
  } catch (cause) {
    opts.evidence({
      kind: 'facebook-collection-failed',
      stage,
      error: errorCode(cause),
      detail: cause instanceof Error ? cause.message.slice(0, 160) : undefined,
    });
    error =
      cause instanceof Error && /^[A-Z_]+(?::|$)/.test(cause.message)
        ? cause.message.split(':')[0]
        : errorCode(cause);
    if (error === 'RATE_LIMIT') error = 'RATE_LIMITED';
  } finally {
    await chrome.close();
  }
  const derived = aggregateFacebook(datasets['facebook.videos']!, datasets['facebook.comments']!);
  datasets['facebook.users'] = derived.users;
  datasets['facebook.tags'] = derived.tags;
  datasets['facebook.keyword-evidence'] = derived.keywords;
  opts.progress(counts());
  return {
    complete: !error,
    error,
    requests,
    datasets,
    scope: 'configured-keyword-budget-videos-comments-replies',
    allPlatformMatchesVerified: false,
  };
}
