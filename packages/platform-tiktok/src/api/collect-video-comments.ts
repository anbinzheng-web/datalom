import { inspectCommentPanel, openCommentPanel } from './comment-panel.ts';
import { openCommentVideo } from './open-comment-video.ts';
import { isVideoCommentsInput, videoUrlSchema } from '@datalom/platform-runtime/contracts/index';
import { redact } from '@datalom/platform-runtime/logging';
import type { Page, Response } from 'playwright-core';
import type { CollectContext } from './collector.ts';
import { createHarvest } from './harvest.ts';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';

export { parseCommentPage, type CommentPage } from './comment-page.ts';
import { parseCommentPage } from './comment-page.ts';

export function commentPageUrl(template: string, cursor: string): string {
  const url = new URL(template);
  if (
    url.origin !== 'https://www.tiktok.com' ||
    !['/api/comment/list/', '/api/comment/list/reply/'].includes(url.pathname)
  )
    throw new Error('COMMENT_API_URL_MISMATCH');
  url.searchParams.set('cursor', cursor);
  // Let TikTok's page fetch wrapper sign the changed query; never reuse an old signature.
  for (const key of [...url.searchParams.keys()])
    if (/^(X-Bogus|X-Gnarly|X-Dynosaur|_signature|msToken)$/i.test(key))
      url.searchParams.delete(key);
  return url.toString();
}

export async function fetchCommentPage(
  page: Page,
  url: string,
  signal: AbortSignal,
  onResponse?: (evidence: Record<string, unknown>) => void,
) {
  checkAbort(signal);
  const result = await page.evaluate(async (target) => {
    try {
      const response = await fetch(target, {
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();
      return {
        status: response.status,
        text: text.length <= 2 * 1024 * 1024 ? text : '',
        error: null,
      };
    } catch {
      return { status: 0, text: '', error: 'COMMENT_API_REQUEST_FAILED' };
    }
  }, url);
  checkAbort(signal);
  onResponse?.({
    httpStatus: result.status,
    responseLength: result.text.length,
    requestError: result.error,
  });
  if (result.status === 429) throw new Error('SITE_RATE_LIMITED');
  if (result.status === 401) throw new Error('LOGIN_REQUIRED');
  if (result.status === 403) throw new Error('COMMENT_API_FORBIDDEN');
  if (result.status !== 200) throw new Error(result.error ?? 'COMMENT_API_REQUEST_FAILED');
  try {
    return JSON.parse(result.text) as unknown;
  } catch {
    throw new Error('COMMENT_API_NOT_JSON');
  }
}

export async function walkCommentPages(opts: {
  epoch?: () => number;
  first: unknown;
  videoId: string;
  parentCommentId: string | null;
  next: (cursor: string) => Promise<unknown>;
  signal: AbortSignal;
  emit: (rows: DataRow[]) => void;
  budget?: { seen: Set<string>; limit: number };
  onPage?: (evidence: Record<string, unknown>) => void;
}) {
  let body = opts.first;
  const seen = opts.budget?.seen ?? new Set<string>();
  const limit = opts.budget?.limit ?? Infinity;
  const cursors = new Set<string>(['0']);
  let stalled = 0;
  let replaying = false;
  let requestCursor = '0';
  while (true) {
    checkAbort(opts.signal);
    if (seen.size >= limit) return;
    const batch = parseCommentPage(body, opts.videoId, opts.parentCommentId);
    const fresh = batch.records.filter((row) => {
      const key = String(row.commentId);
      if (seen.has(key) || seen.size >= limit) return false;
      seen.add(key);
      return true;
    });
    opts.emit(fresh);
    opts.onPage?.({
      videoId: opts.videoId,
      requestCursor,
      cursor: batch.cursor,
      hasMore: !batch.ended,
      returned: batch.records.length,
      added: fresh.length,
      collected: seen.size,
      limit: Number.isFinite(limit) ? limit : null,
      stopReason: seen.size >= limit ? 'limit' : batch.ended ? 'exhausted' : null,
    });
    if (batch.ended || seen.size >= limit) return;
    if (fresh.length) replaying = false;
    stalled = fresh.length || replaying ? 0 : stalled + 1;
    if (cursors.has(batch.cursor) || stalled >= 2) throw new Error('COMMENT_PAGINATION_INCOMPLETE');
    cursors.add(batch.cursor);
    requestCursor = batch.cursor;
    const epoch = opts.epoch?.();
    body = await opts.next(batch.cursor);
    if (opts.epoch?.() !== epoch) {
      requestCursor = '0';
      cursors.clear();
      cursors.add('0');
      stalled = 0;
      replaying = true;
    }
  }
}

export async function collectVideoComments(ctx: CollectContext) {
  const input = ctx.run.input;
  if (!isVideoCommentsInput(input)) throw new Error('SCRIPT_INPUT_MISMATCH');
  const { page, signal } = ctx;
  const harvest = createHarvest(page, signal);
  const pageResponses = new Map<string, unknown>();
  let apiAvailable = true;
  let responseFailure: Error | undefined;
  let first: { url: string; body: unknown } | undefined;
  let targetId = /\/(?:video|photo)\/(\d+)/.exec(input.videoUrl)?.[1];
  let saved = 0;
  const users = new Map<string, DataRow>();
  const parents: DataRow[] = [];
  const globalSeen = new Set<string>();
  const budget = { seen: new Set<string>(), limit: input.maxComments ?? 500 };
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (url.origin !== 'https://www.tiktok.com') return;
    if (
      url.pathname === '/api/comment/list/' &&
      (!targetId || url.searchParams.get('aweme_id') === targetId)
    ) {
      if (response.status() === 429) responseFailure = new Error('SITE_RATE_LIMITED');
      if (response.status() === 401) responseFailure = new Error('LOGIN_REQUIRED');
      if (response.status() === 403) responseFailure = new Error('COMMENT_API_FORBIDDEN');
    }
    if (
      url.pathname === '/api/comment/list/' &&
      (!targetId || url.searchParams.get('aweme_id') === targetId) &&
      url.searchParams.get('cursor') === '0'
    ) {
      void response
        .json()
        .then((body) => {
          if (!first) {
            first = { url: response.url(), body };
            ctx.sample = {
              source: url.pathname,
              videoId: targetId,
              parentCommentId: null,
              body: redact(body),
            };
          }
        })
        .catch(() => {});
    }
    if (url.pathname === '/api/comment/list/' && url.searchParams.get('aweme_id') === targetId) {
      void response
        .json()
        .then((body) => {
          if (pageResponses.size < 100)
            pageResponses.set(url.searchParams.get('cursor') ?? '0', body);
        })
        .catch(() => {});
    }
  };
  page.on('response', listener);
  const buffered: DataRow[] = [];
  const flush = () => {
    while (buffered.length) {
      const batch = buffered.slice(0, 100);
      ctx.emit('tiktok.comments', batch);
      buffered.splice(0, batch.length);
    }
  };
  const save = (rows: DataRow[]) => {
    const fresh = rows
      .filter((row) => {
        const id = String(row.commentId);
        if (globalSeen.has(id)) return false;
        globalSeen.add(id);
        return true;
      })
      .map((row) => ({ ...row, videoUrl: canonicalUrl }));
    if (!fresh.length) return;
    buffered.push(...fresh);
    if (buffered.length >= 100) flush();
    saved += fresh.length;
    for (const user of aggregate([], fresh).users) {
      const key = String(user.userKey),
        old = users.get(key);
      users.set(key, {
        ...old,
        ...user,
        commentCount: Number(old?.commentCount ?? 0) + Number(user.commentCount),
      });
    }
    ctx.progress(`采集评论及回复 · 已读取 ${saved} / ${budget.limit} 条（单次去重）`);
  };
  let canonicalUrl = input.videoUrl;
  try {
    ctx.progress('打开视频评论');
    await openCommentVideo({
      page,
      harvest,
      url: input.videoUrl,
      signal,
      progress: ctx.progress,
      evidence: (value) => {
        ctx.sample = value;
      },
    });
    if (!targetId)
      await page.waitForURL(
        (url) => {
          const parsed = videoUrlSchema.safeParse(url.toString());
          return parsed.success && /\/(?:video|photo)\/\d+$/.test(parsed.data);
        },
        { waitUntil: 'commit', timeout: 20000 },
      );
    canonicalUrl = videoUrlSchema.parse(page.url());
    const resolved = /\/(?:video|photo)\/(\d+)/.exec(canonicalUrl)?.[1];
    if (!resolved || (targetId && resolved !== targetId)) throw new Error('VIDEO_URL_MISMATCH');
    targetId = resolved;
    await page.evaluate(() => {
      // Keep the requested video selected while collecting. The feed otherwise auto-advances.
      document.addEventListener(
        'play',
        (event) => {
          if (event.target instanceof HTMLVideoElement) event.target.pause();
        },
        true,
      );
      document.querySelectorAll('video').forEach((video) => video.pause());
    });
    await harvest.requireLogin();
    ctx.progress('等待视频评论加载');
    if (!first) {
      ctx.progress('正在打开评论面板');
      await openCommentPanel(page, signal);
    }
    ctx.progress('等待评论接口返回数据');
    const until = Date.now() + 15000;
    while (!first && Date.now() < until) {
      checkAbort(signal);
      if (responseFailure) throw responseFailure;
      await pause(200, signal);
    }
    if (responseFailure) throw responseFailure;
    if (!first || new URL(first.url).searchParams.get('aweme_id') !== targetId)
      throw new Error('COMMENT_API_NOT_RECOGNIZED');
    const receive = (body: unknown, source: string, parentCommentId: string | null) => {
      ctx.sample = { source, videoId: targetId, parentCommentId, body: redact(body) };
      return body;
    };
    await walkCommentPages({
      budget,
      first: receive(first.body, '/api/comment/list/', null),
      videoId: targetId,
      parentCommentId: null,
      signal,
      next: async (cursor) => {
        await pause(300, signal);
        if (apiAvailable) {
          try {
            return receive(
              await fetchCommentPage(page, commentPageUrl(first!.url, cursor), signal),
              '/api/comment/list/',
              null,
            );
          } catch (error) {
            checkAbort(signal);
            if (
              !(error instanceof Error) ||
              !['COMMENT_API_NOT_JSON', 'COMMENT_API_REQUEST_FAILED'].includes(error.message)
            )
              throw error;
            apiAvailable = false;
            ctx.progress('主评论接口未返回数据，切换为页面触发分页');
          }
        }
        // The comment pane is separate from the video feed. Scrolling the feed changes videos.
        for (let attempt = 0; attempt < 30; attempt++) {
          checkAbort(signal);
          if (responseFailure) throw responseFailure;
          if (pageResponses.has(cursor)) {
            const body = pageResponses.get(cursor);
            pageResponses.delete(cursor);
            return receive(body, '/api/comment/list/', null);
          }
          if (!new RegExp(`/(?:video|photo)/${targetId}$`).test(new URL(page.url()).pathname))
            throw new Error('COMMENT_VIDEO_MISMATCH');
          if (attempt % 6 === 0) await harvest.state();
          await openCommentPanel(page, signal);
          if ((await page.evaluate(inspectCommentPanel, true)) !== 'ready')
            throw new Error('COMMENT_SCROLL_CONTAINER_MISSING');
          await pause(500, signal);
        }
        throw new Error('COMMENT_PAGINATION_INCOMPLETE');
      },
      emit: (rows) => {
        if (rows.some((row) => row.replyCount === null))
          throw new Error('COMMENT_REPLY_COUNT_MISSING');
        save(rows);
        parents.push(
          ...rows
            .filter((row) => Number(row.replyCount) > 0)
            .map((row) => ({ commentId: row.commentId })),
        );
        flush();
      },
    });
    for (const parent of parents) {
      if (budget.seen.size >= budget.limit) break;
      const parentId = String(parent.commentId);
      const url = new URL(first.url);
      url.pathname = '/api/comment/list/reply/';
      url.searchParams.delete('aweme_id');
      url.searchParams.set('count', '3');
      url.searchParams.set('item_id', targetId);
      url.searchParams.set('comment_id', parentId);
      const read = async (cursor: string) => {
        await pause(300, signal);
        return receive(
          await fetchCommentPage(page, commentPageUrl(url.toString(), cursor), signal),
          url.pathname,
          parentId,
        );
      };
      await walkCommentPages({
        budget,
        first: await read('0'),
        videoId: targetId,
        parentCommentId: parentId,
        signal,
        next: read,
        emit: save,
      });
    }
    flush();
    for (let i = 0, list = [...users.values()]; i < list.length; i += 100)
      ctx.emit('tiktok.users', list.slice(i, i + 100));
    ctx.progress(
      saved >= budget.limit
        ? `已达评论上限 ${budget.limit} 条`
        : `可访问评论及回复已采完 · ${saved} 条`,
    );
  } catch (error) {
    if (!signal.aborted) flush();
    checkAbort(signal);
    // Once any rows were emitted a new account must not restart the same attempt and duplicate them.
    if (
      saved &&
      error instanceof Error &&
      !['HUMAN_REQUIRED', 'LOGIN_REQUIRED', 'SITE_RATE_LIMITED'].includes(error.message)
    )
      throw new Error(`COMMENT_COLLECTION_INCOMPLETE:${error.message}`);
    throw error;
  } finally {
    page.off('response', listener);
    harvest.stop();
  }
}
