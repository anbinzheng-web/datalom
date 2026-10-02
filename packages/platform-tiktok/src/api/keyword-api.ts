import { checkKeywordRelevance, type KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Page, Response } from 'playwright-core';
import type { KeywordInput, Dataset } from '@datalom/platform-runtime/contracts/index';
import { redact } from '@datalom/platform-runtime/logging';
import { aggregate, parseTikTok, type DataRow } from '@datalom/platform-runtime/tiktok-parser';
import { parseSearchPage, searchTemplate, searchRequestUrl } from './reverse-search.ts';
import { browserPageFetch, requestUrl, MAX_BODY_BYTES } from '@datalom/platform-runtime/reverse-transports';
import { walkCommentPages } from './collect-video-comments.ts';
import { searchUrl } from './tiktok-api.ts';
import { tikTokSession } from './tiktok-session.ts';
import { failureCode } from '@datalom/platform-runtime/scheduler';
import { checkAbort, pause, withTimeout } from '@datalom/platform-runtime/pause';
import type { CollectContext } from './collector.ts';

const volatile = /^(X-Bogus|X-Gnarly|X-Dynosaur|_signature|msToken)$/i;
const codeOf = failureCode;

export function keywordSearchUrl(
  template: string,
  keyword: string,
  cursor: string,
  searchId?: string,
) {
  const url = new URL(searchRequestUrl(template, keyword, cursor, searchId));
  for (const key of [...url.searchParams.keys()])
    if (volatile.test(key)) url.searchParams.delete(key);
  // The observed web request carries both; advance them together, never infer cursor from row count.
  if (url.searchParams.has('offset')) url.searchParams.set('offset', cursor);
  return url.toString();
}

const commentEnvironment = new Set([
  'webidlasttime',
  'aid',
  'app_language',
  'app_name',
  'browser_language',
  'browser_name',
  'browser_online',
  'browser_platform',
  'browser_version',
  'channel',
  'cookie_enabled',
  'data_collection_enabled',
  'device_id',
  'device_platform',
  'focus_state',
  'from_page',
  'history_len',
  'is_fullscreen',
  'is_page_visible',
  'odinid',
  'os',
  'priority_region',
  'referer',
  'region',
  'root_referer',
  'screen_height',
  'screen_width',
  'tz_name',
  'user_is_login',
  'verifyfp',
  'webcast_language',
]);

export function keywordCommentTemplate(template: string, keyword: string) {
  const source = searchTemplate(template, keyword);
  const base = new URL('/api/comment/list/', source.origin);
  for (const [key, value] of source.searchParams) {
    if (volatile.test(key) || !commentEnvironment.has(key.toLowerCase())) continue;
    base.searchParams.set(key, value);
  }
  return base.toString();
}

export function keywordCommentUrl(
  template: string,
  keyword: string,
  videoId: string,
  cursor: string,
) {
  return requestUrl(
    { videoId, cursor, parentId: null },
    { mainUrl: keywordCommentTemplate(template, keyword) },
  );
}

export function keywordCommentReplyUrl(
  template: string,
  keyword: string,
  videoId: string,
  parentId: string,
  cursor: string,
) {
  return requestUrl(
    { videoId, cursor, parentId },
    { mainUrl: keywordCommentTemplate(template, keyword) },
  );
}

function jsonResponse(status: number, text: string) {
  if (status === 429) throw new Error('SITE_RATE_LIMITED');
  if (status === 401) throw new Error('LOGIN_REQUIRED');
  if (status === 403) throw new Error('API_FORBIDDEN');
  if (status !== 200) throw new Error('API_HTTP_ERROR');
  if (!text.trim()) throw new Error('API_EMPTY_BODY');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('API_NOT_JSON');
  }
}

export type KeywordApiSession = {
  epoch?: () => number;
  first: unknown;
  template: string;
  fetch: (url: string) => Promise<unknown>;
};

/** Business contract is shared with the old task: same ranking, strict likes threshold and datasets. */
export async function collectKeywordApi(opts: {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  session: KeywordApiSession;
  signal: AbortSignal;
  emit: (dataset: Dataset, rows: DataRow[]) => void;
  evidence: (entry: Record<string, unknown>) => void;
  failure: (videoId: string, error: string) => void;
}) {
  const { input, session, signal, emit, evidence } = opts;
  const videos: DataRow[] = [],
    comments: DataRow[] = [];
  const ids = new Set<string>(),
    cursors = new Set(['0']);
  const incomplete: { videoId: string; reason: string }[] = [];
  let body = session.first,
    cursor = '0',
    stalled = 0;
  let replaying = false;
  for (let page = 0; ; page++) {
    checkAbort(signal);
    const parsed = parseSearchPage(body);
    // Keep all original fields including raw, authorId, coverUrl and contentType for display/export.
    const rows = parseTikTok(body, new Date().toISOString())?.records ?? [];
    const fresh: DataRow[] = [];
    for (const row of rows) {
      const id = String(row.videoId);
      if (ids.has(id)) continue;
      if (videos.length >= input.videoLimit) break;
      if (input.minLikes !== null && row.likes === null) throw new Error('REQUIRED_LIKES_MISSING');
      ids.add(id);
      row.qualifies = input.minLikes === null || Number(row.likes) > input.minLikes;
      row.rank = videos.length + 1;
      videos.push(row);
      fresh.push(row);
    }
    if (fresh.length) emit('tiktok.videos', fresh);
    evidence({
      stage: 'search',
      requestCursor: cursor,
      cursor: parsed.cursor,
      returned: rows.length,
      added: fresh.length,
      collected: videos.length,
      hasMore: !parsed.ended,
      stopReason: videos.length >= input.videoLimit ? 'limit' : parsed.ended ? 'exhausted' : null,
    });
    if (parsed.ended || videos.length >= input.videoLimit) break;
    if (fresh.length) replaying = false;
    stalled = fresh.length || replaying ? 0 : stalled + 1;
    if (cursors.has(parsed.cursor) || stalled >= 3) throw new Error('SEARCH_PAGINATION_STALLED');
    if (page >= 99) throw new Error('SEARCH_PAGE_LIMIT');
    cursors.add(parsed.cursor);
    cursor = parsed.cursor;
    const epoch = session.epoch?.();
    body = await session.fetch(
      keywordSearchUrl(session.template, input.keyword, cursor, parsed.searchId),
    );
    if (session.epoch?.() !== epoch) {
      cursor = '0';
      cursors.clear();
      cursors.add('0');
      stalled = 0;
      replaying = true;
      evidence({ stage: 'search-restart', reason: 'cookie-failover', retained: videos.length });
    }
  }
  for (const video of videos.filter((v) => v.qualifies === true)) {
    checkAbort(signal);
    if (input.commentsPerVideo === 0 || comments.length >= input.totalComments) break;
    if (video.commentsCount === 0) continue;
    if (!(await checkKeywordRelevance(video, signal, opts.relevance, evidence))) continue;
    const videoId = String(video.videoId);
    const fetchPage = (cursor: string) =>
      session.fetch(keywordCommentUrl(session.template, input.keyword, videoId, cursor));
    try {
      await walkCommentPages({
        first: await fetchPage('0'),
        epoch: session.epoch,
        videoId,
        parentCommentId: null,
        signal,
        budget: {
          seen: new Set<string>(),
          limit: Math.min(input.commentsPerVideo, input.totalComments - comments.length),
        },
        next: fetchPage,
        emit: (rows) => {
          if (rows.length) {
            emit('tiktok.comments', rows);
            comments.push(...rows);
          }
        },
        onPage: (entry) => evidence({ stage: 'comments', ...entry }),
      });
    } catch (error) {
      checkAbort(signal);
      const code = codeOf(error);
      opts.failure(videoId, code);
      // Stop authentication, proxy and transport failures. Only independent data failures can continue.
      if (
        ![
          'COMMENT_API_REJECTED',
          'COMMENT_PAGE_NOT_RECOGNIZED',
          'COMMENT_PAGE_MISMATCH',
          'COMMENT_CURSOR_MISSING',
          'COMMENT_PAGINATION_INCOMPLETE',
        ].includes(code)
      )
        throw error;
      incomplete.push({ videoId, reason: code });
    }
  }
  checkAbort(signal);
  const result = aggregate(videos, comments);
  emit('tiktok.users', result.users);
  emit('tiktok.tags', result.tags);
  emit('tiktok.keyword-evidence', result.keywords);
  if (incomplete.length)
    throw new Error(
      `KEYWORD_COMMENTS_INCOMPLETE:${incomplete.map((v) => `${v.videoId}:${v.reason}`).join(',')}`,
    );
}

/** One document bootstraps native query/session/SDK. All later pages and works use fetch, with no UI actions. */
export async function runKeywordApi(ctx: CollectContext, input: KeywordInput) {
  const { page, signal } = ctx;
  const entries: Record<string, unknown>[] = [];
  const started = performance.now();
  let document: Record<string, unknown> | null = null;
  let first: Response | undefined;
  let initialNavigations = 0;
  let requests = 0,
    outcome = 'failed',
    failure: string | null = null;
  const evidence = (entry: Record<string, unknown>) => {
    if (entries.length < 1000) entries.push(entry);
    ctx.progress(
      entry.stage === 'search'
        ? '搜索关键词 · API 分页'
        : entry.stage === 'comments'
          ? `采集评论 · ${entry.videoId}`
          : '请求平台 API',
      { event: 'keyword.api', ...entry },
    );
  };
  const listener = (response: Response) => {
    try {
      const url = new URL(response.url());
      if (url.origin !== 'https://www.tiktok.com') return;
      if (
        response.request().resourceType() === 'document' &&
        response.frame() === page.mainFrame()
      ) {
        document = {
          path: url.pathname,
          httpStatus: response.status(),
          contentType: response.headers()['content-type'] ?? null,
          server: response.headers().server ?? null,
        };
      }
      if (first || response.request().method() !== 'GET') return;
      searchTemplate(response.url(), input.keyword);
      if (['0', null].includes(url.searchParams.get('cursor'))) first = response;
    } catch {
      /* Non-search responses are not input to this collector. */
    }
  };
  const failureEvidence = (videoId: string, code: string) => {
    try {
      ctx.recordDiagnostic?.({
        schemaVersion: 1,
        runId: ctx.run.runId,
        attemptId: ctx.run.attemptId,
        stage: 'comments',
        videoId,
        error: { code },
        sample: ctx.sample,
        document,
        createdAt: new Date().toISOString(),
      });
    } catch {
      ctx.progress('保存评论 API 现场失败', {
        event: 'capture.failed',
        videoId,
        reason: 'API_EVIDENCE_UNAVAILABLE',
      });
    }
  };
  const recordResponse = (
    url: string,
    status: number,
    text: string,
    durationMs: number,
    mode: string,
  ) => {
    const target = new URL(url);
    const entry: Record<string, unknown> = {
      stage: 'response',
      path: target.pathname,
      videoId: target.searchParams.get('aweme_id'),
      requestCursor: target.searchParams.get('cursor') ?? '0',
      httpStatus: status,
      bytes: Buffer.byteLength(text),
      durationMs,
      mode,
    };
    try {
      const body = jsonResponse(status, text);
      const root = body as Record<string, unknown> | null;
      entry.businessStatus = root?.status_code ?? root?.statusCode ?? null;
      ctx.sample = {
        source: target.pathname,
        videoId: target.searchParams.get('aweme_id'),
        body: redact(body),
      };
      return body;
    } catch (error) {
      entry.error = codeOf(error);
      throw error;
    } finally {
      evidence(entry);
    }
  };
  page.on('response', listener);
  try {
    ctx.progress('初始化搜索 API 会话');
    await ctx.verifyProxy?.();
    checkAbort(signal);
    initialNavigations++;
    await page.goto(searchUrl(input.keyword), { waitUntil: 'commit', timeout: 30000 });
    const until = Date.now() + 20000;
    while (!first && Date.now() < until) await pause(100, signal);
    if (!first) {
      await requireSession(page, signal);
      throw new Error('SEARCH_API_NOT_OBSERVED');
    }
    const source = first as Response;
    if (Number(source.headers()['content-length'] ?? 0) > MAX_BODY_BYTES)
      throw new Error('BODY_TOO_LARGE');
    const bytes = await withTimeout(source.body(), 15000, 'SEARCH_RESPONSE_TIMEOUT');
    if (bytes.length > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    requests++;
    const body = recordResponse(
      source.url(),
      source.status(),
      bytes.toString('utf8'),
      Math.round(performance.now() - started),
      'native-bootstrap',
    );
    await requireSession(page, signal);
    const session: KeywordApiSession = {
      first: body,
      template: source.url(),
      fetch: async (url) => {
        checkAbort(signal);
        const t = performance.now();
        try {
          await ctx.verifyProxy?.();
          await pause(300, signal);
          requests++;
          const response = await withTimeout(
            browserPageFetch(page, url, signal),
            20000,
            'API_REQUEST_TIMEOUT',
          );
          return recordResponse(
            url,
            response.status,
            response.text,
            Math.round(performance.now() - t),
            'page-sdk-fetch',
          );
        } catch (error) {
          evidence({
            stage: 'request-failed',
            path: new URL(url).pathname,
            videoId: new URL(url).searchParams.get('aweme_id'),
            requestCursor: new URL(url).searchParams.get('cursor'),
            error: codeOf(error),
            durationMs: Math.round(performance.now() - t),
          });
          throw error;
        }
      },
    };
    await collectKeywordApi({
      input,
      session,
      signal,
      emit: ctx.emit,
      evidence,
      failure: failureEvidence,
    });
    outcome = 'succeeded';
  } catch (error) {
    failure = codeOf(error);
    throw error;
  } finally {
    page.off('response', listener);
    const report = {
      schemaVersion: 1,
      runId: ctx.run.runId,
      attemptId: ctx.run.attemptId,
      scriptVersion: ctx.run.scriptVersion,
      transport: 'browser-session-api',
      outcome,
      error: failure,
      requests,
      durationMs: Math.round(performance.now() - started),
      document,
      entries,
      interactions: { initialNavigations, detailNavigations: 0, clicks: 0, scrolls: 0 },
      createdAt: new Date().toISOString(),
    };
    try {
      ctx.recordDiagnostic?.(report);
    } catch {
      ctx.progress('保存 API 现场失败', {
        event: 'capture.failed',
        reason: 'API_EVIDENCE_UNAVAILABLE',
      });
    }
  }
}

async function requireSession(page: Page, signal: AbortSignal) {
  checkAbort(signal);
  const state = await withTimeout(tikTokSession(page), 20000, 'SESSION_CHECK_TIMEOUT');
  checkAbort(signal);
  if (state === 'login_required') throw new Error('LOGIN_REQUIRED');
  if (state === 'needs_human') throw new Error('HUMAN_REQUIRED');
  if (state === 'site_unavailable') throw new Error('SITE_UNAVAILABLE');
  if (state !== 'ready') throw new Error('LOGIN_STATE_UNKNOWN');
}
