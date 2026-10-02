import { checkKeywordRelevance, type KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Dataset, KeywordInput } from '@datalom/platform-runtime/contracts/business';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { apiBrowserHeaders } from '@datalom/platform-runtime/api-diagnostics';
import { openChromeTransport } from '@datalom/platform-runtime/impit-api';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { nativeHttpRequest } from '@datalom/platform-runtime/native-http';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { aggregate, parseYouTube, type DataRow } from './youtube-parser.ts';
import { searchUrl, watchUrl } from './youtube-api.ts';
import {
  innertubeRequest,
  object,
  parseYouTubeDocument,
  youtubeUrlAllowed,
  YouTubeCookieJar,
} from './youtube-native.ts';

const YOUTUBE_TRANSPORT_ATTEMPTS = 3;
const MAX_TRANSPORT_RECOVERIES = 8;
const cursorHash = (token: string | null) =>
  token ? createHash('sha256').update(token).digest('hex') : null;

export function retryableYouTubeTransportError(code: string) {
  return new Set(['PROXY_CONNECT_FAILED', 'PROXY_TUNNEL_FAILED']).has(code);
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  const row = object(value);
  if (typeof row.simpleText === 'string') return row.simpleText;
  if (Array.isArray(row.runs)) return row.runs.map((v) => text(object(v).text)).join('');
  return '';
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value !== 'string') return null;
  const m = value.replace(/,/g, '').match(/([\d.]+)\s*([KMB万亿])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  return Math.floor(
    n *
      (unit === 'k'
        ? 1e3
        : unit === 'm'
          ? 1e6
          : unit === 'b'
            ? 1e9
            : unit === '万'
              ? 1e4
              : unit === '亿'
                ? 1e8
                : 1),
  );
}

function findContinuation(value: unknown): string | null {
  let fallback: string | null = null;
  let preferred: string | null = null;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    const row = object(v);
    const item = object(row.continuationItemRenderer);
    const command = object(object(item.continuationEndpoint).continuationCommand);
    if (typeof command.token === 'string' && command.token) {
      if (item.trigger === 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN') preferred = command.token;
      else if (!fallback) fallback = command.token;
    }
    for (const child of Object.values(row)) walk(child);
  };
  walk(value);
  return preferred ?? fallback;
}

function findCommentSection(value: unknown): unknown | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCommentSection(item);
      if (found) return found;
    }
    return null;
  }
  const row = object(value);
  if (row.itemSectionRenderer?.sectionIdentifier === 'comment-item-section')
    return row.itemSectionRenderer;
  for (const child of Object.values(row)) {
    const found = findCommentSection(child);
    if (found) return found;
  }
  return null;
}

function detailOf(data: unknown, video: DataRow): DataRow {
  const root = object(data);
  const contents = object(object(object(root.contents).twoColumnWatchNextResults).results);
  const rows = Array.isArray(object(contents.results).contents)
    ? object(contents.results).contents
    : [];
  const primary = object(
    object(rows.find((v: unknown) => object(v).videoPrimaryInfoRenderer)).videoPrimaryInfoRenderer,
  );
  const menu = object(object(primary.videoActions).menuRenderer);
  const buttons = Array.isArray(menu.topLevelButtons) ? object(menu.topLevelButtons[0]) : {};
  const like = object(
    object(
      object(
        object(object(buttons.segmentedLikeDislikeButtonViewModel).likeButtonViewModel)
          .likeButtonViewModel,
      ).toggleButtonViewModel,
    ).toggleButtonViewModel,
  );
  const button = object(object(like.defaultButtonViewModel).buttonViewModel);
  const likes = numberOf(button.title) ?? numberOf(button.accessibilityText);
  const commentsSection = rows.find(
    (v: unknown) =>
      object(v).itemSectionRenderer &&
      object(v).itemSectionRenderer.sectionIdentifier === 'comment-item-section',
  );
  const commentHeader = object(object(object(commentsSection).itemSectionRenderer).header);
  const commentsCount = numberOf(text(object(commentHeader.commentsHeaderRenderer).countText));
  return { ...video, likes, commentsCount: commentsCount ?? video.commentsCount };
}

export async function collectServerYouTubeKeyword(opts: {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  credential: PoolCredential;
  signal: AbortSignal;
  maxPages?: number;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
  beforeRequest?: () => void;
}) {
  if (!opts.credential.proxy) throw new LabError('PROXY_REQUIRED');
  const proxy = opts.credential.proxy;
  const datasets: Partial<Record<Dataset, DataRow[]>> = {
    'youtube.videos': [],
    'youtube.comments': [],
  };
  const counts = () => Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, v.length]));
  const jar = new YouTubeCookieJar(opts.credential.cookies);
  const env = apiBrowserHeaders(opts.credential);
  const upstream = await accountUpstream(new URL(opts.credential.proxy.url));
  let chrome = await openChromeTransport(proxy, opts.signal, upstream, 60_000, (entry) => {
    opts.evidence({ kind: 'proxy-connection', ...entry });
  });
  let requests = 0;
  let requestAttempts = 0;
  let recoveries = 0;
  let error: string | null = null;
  const maxPages = opts.maxPages ?? 100;
  const exchange = async (
    target: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body: string | undefined,
    request: number,
  ) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= YOUTUBE_TRANSPORT_ATTEMPTS; attempt++) {
      opts.signal.throwIfAborted();
      opts.beforeRequest?.();
      chrome.takeProxyFailure();
      const started = Date.now();
      try {
        requestAttempts++;
        const response = await nativeHttpRequest(
          chrome.client,
          { url: target, method, headers, ...(body === undefined ? {} : { body }) },
          opts.signal,
          youtubeUrlAllowed,
          60_000,
        );
        opts.evidence({
          kind: 'http-exchange',
          path: new URL(target).pathname,
          method,
          request,
          attempt,
          status: response.status,
          bytes: response.bytes,
          durationMs: Date.now() - started,
        });
        return response;
      } catch (cause) {
        lastError = cause;
        const bridgeFailure = chrome.takeProxyFailure();
        const code = bridgeFailure?.error ?? errorCode(cause);
        opts.evidence({
          kind: 'http-exchange',
          path: new URL(target).pathname,
          method,
          request,
          attempt,
          status: null,
          bytes: 0,
          durationMs: Date.now() - started,
          error: code,
        });
        if (
          !retryableYouTubeTransportError(code) ||
          attempt === YOUTUBE_TRANSPORT_ATTEMPTS ||
          recoveries >= MAX_TRANSPORT_RECOVERIES ||
          opts.signal.aborted
        )
          throw new LabError(code);
        recoveries++;
        const delayMs = 500 * attempt;
        opts.evidence({
          kind: 'proxy-reconnect',
          request,
          attempt,
          reason: code,
          delayMs,
          recoveries,
        });
        await chrome.close();
        await delay(delayMs, undefined, { signal: opts.signal });
        opts.signal.throwIfAborted();
        chrome = await openChromeTransport(proxy, opts.signal, upstream, 60_000, (entry) =>
          opts.evidence({ kind: 'proxy-connection', ...entry }),
        );
      }
    }
    throw lastError;
  };
  const request = async (target: string, method: 'GET' | 'POST', body?: { context?: never }) => {
    if (++requests > maxPages) throw new LabError('PAGE_LIMIT');
    const response = await exchange(
      target,
      method,
      { ...env, accept: method === 'GET' ? 'text/html' : '*/*', cookie: jar.header(target) },
      body ? JSON.stringify(body) : undefined,
      requests,
    );
    jar.receive(response.setCookies, target);
    if (response.status !== 200) throw new LabError('YOUTUBE_HTTP_FAILED');
    return response.body;
  };
  try {
    const searchTarget = searchUrl(opts.input.keyword);
    const initialHtml = await request(searchTarget, 'GET');
    const initial = parseYouTubeDocument(initialHtml);
    const candidates: DataRow[] = [];
    const seen = new Set<string>();
    const add = (parsed: ReturnType<typeof parseYouTube>) => {
      for (const row of parsed?.records ?? []) {
        const key = String(row.videoId);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(row);
        }
      }
    };
    const searchPage = parseYouTube(initial.data, new Date().toISOString());
    if (!searchPage) throw new LabError('YOUTUBE_SEARCH_UNRECOGNIZED');
    add(searchPage);
    let token = findContinuation(initial.data);
    opts.evidence({
      kind: 'search-page',
      returned: searchPage.records.length,
      unique: candidates.length,
      nextCursorHash: cursorHash(token),
      hasMore: !!token,
    });
    while (candidates.length < opts.input.videoLimit && token) {
      const target = `${new URL('https://www.youtube.com/youtubei/v1/search')}?prettyPrint=false`;
      const call = innertubeRequest(
        initial.config,
        jar,
        searchTarget,
        { continuation: token },
        env,
      );
      if (++requests > maxPages) throw new LabError('PAGE_LIMIT');
      const response = await exchange(target, 'POST', call.headers, call.body, requests);
      jar.receive(response.setCookies, target);
      if (response.status !== 200) throw new LabError('YOUTUBE_HTTP_FAILED');
      const page = JSON.parse(response.body);
      const parsedPage = parseYouTube(page, new Date().toISOString());
      if (!parsedPage) throw new LabError('YOUTUBE_SEARCH_UNRECOGNIZED');
      const before = candidates.length;
      add(parsedPage);
      const next = findContinuation(page);
      opts.evidence({
        kind: 'search-page',
        returned: parsedPage.records.length,
        added: candidates.length - before,
        unique: candidates.length,
        cursorHash: cursorHash(token),
        nextCursorHash: cursorHash(next),
        hasMore: !!next,
      });
      if (next === token && candidates.length < opts.input.videoLimit)
        throw new LabError('PAGINATION_STALLED');
      if (!next) break;
      token = next;
    }
    for (const candidate of candidates.slice(0, opts.input.videoLimit)) {
      opts.signal.throwIfAborted();
      const html = await request(watchUrl(String(candidate.videoId)), 'GET');
      const watch = parseYouTubeDocument(html);
      const video = detailOf(watch.data, candidate);
      if (opts.input.minLikes !== null && video.likes === null)
        throw new LabError('YOUTUBE_LIKES_MISSING');
      video.qualifies = opts.input.minLikes === null || Number(video.likes) > opts.input.minLikes;
      video.rank = datasets['youtube.videos']!.length + 1;
      datasets['youtube.videos']!.push(video);
      opts.evidence({
        kind: 'video-detail',
        videoId: video.videoId,
        likes: video.likes,
        qualifies: video.qualifies,
        commentsCount: video.commentsCount,
      });
      opts.progress(counts());
      if (
        video.qualifies !== true ||
        opts.input.commentsPerVideo === 0 ||
        video.commentsCount === 0
      ) {
        opts.evidence({
          kind: 'video-comments-stop',
          videoId: video.videoId,
          reason:
            video.qualifies !== true
              ? 'likes-below-threshold'
              : opts.input.commentsPerVideo === 0
                ? 'disabled'
                : 'zero-comments',
          saved: 0,
        });
        continue;
      }
      if (!(await checkKeywordRelevance(video, opts.signal, opts.relevance, opts.evidence)))
        continue;
      let parsed = parseYouTube(watch.data, new Date().toISOString(), String(video.videoId));
      let comments = parsed?.kind === 'comments' ? parsed.records : [];
      const commentSection = findCommentSection(watch.data);
      if (!commentSection) throw new LabError('YOUTUBE_COMMENT_SECTION_MISSING');
      let commentToken = findContinuation(commentSection);
      if (!commentToken && !comments.length) throw new LabError('YOUTUBE_COMMENT_CURSOR_MISSING');
      const baseCount = datasets['youtube.comments']!.length;
      const budget = Math.min(opts.input.commentsPerVideo, opts.input.totalComments - baseCount);
      const saveComments = () => {
        datasets['youtube.comments']!.splice(
          baseCount,
          datasets['youtube.comments']!.length - baseCount,
          ...comments.slice(0, budget),
        );
        opts.progress(counts());
      };
      saveComments();
      const visited = new Set<string>();
      while (comments.length < budget && commentToken) {
        if (visited.has(commentToken)) throw new LabError('PAGINATION_STALLED');
        visited.add(commentToken);
        if (++requests > maxPages) throw new LabError('PAGE_LIMIT');
        const target = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
        const call = innertubeRequest(
          watch.config,
          jar,
          watchUrl(String(video.videoId)),
          { continuation: commentToken },
          env,
        );
        const response = await exchange(target, 'POST', call.headers, call.body, requests);
        jar.receive(response.setCookies, target);
        if (response.status !== 200) throw new LabError('YOUTUBE_HTTP_FAILED');
        const page = JSON.parse(response.body);
        parsed = parseYouTube(page, new Date().toISOString(), String(video.videoId));
        const byId = new Map(comments.map((row) => [String(row.commentId), row]));
        const before = byId.size;
        for (const row of parsed?.records ?? []) byId.set(String(row.commentId), row);
        comments = [...byId.values()];
        const next = findContinuation(page);
        opts.evidence({
          kind: 'comment-page',
          videoId: video.videoId,
          returned: parsed?.records.length ?? 0,
          added: byId.size - before,
          unique: byId.size,
          cursorHash: cursorHash(commentToken),
          nextCursorHash: cursorHash(next),
          hasMore: !!next,
          saved: Math.min(budget, comments.length),
          scope: 'main-comments',
        });
        saveComments();
        if (next === commentToken && comments.length < budget)
          throw new LabError('PAGINATION_STALLED');
        if (!next) {
          commentToken = null;
          break;
        }
        commentToken = next;
      }
      opts.evidence({
        kind: 'video-comments-stop',
        videoId: video.videoId,
        saved: Math.min(comments.length, budget),
        reason: comments.length >= budget ? 'limit' : 'exhausted',
        hasMore: !!commentToken,
      });
      opts.progress(counts());
      if (datasets['youtube.comments']!.length >= opts.input.totalComments) break;
    }
  } catch (cause) {
    error =
      cause instanceof Error && /^[A-Z_]+/.test(cause.message)
        ? cause.message.split(':')[0]
        : errorCode(cause);
  } finally {
    await chrome.close();
  }
  const derived = aggregate(datasets['youtube.videos'] ?? [], datasets['youtube.comments'] ?? []);
  datasets['youtube.users'] = derived.users;
  datasets['youtube.tags'] = derived.tags;
  datasets['youtube.keyword-evidence'] = derived.keywords;
  opts.progress(counts());
  return {
    complete: !error,
    error,
    requests,
    requestAttempts,
    recoveries,
    datasets,
    scope: 'configured-keyword-budget-main-comments',
    allPlatformMatchesVerified: false,
  };
}
