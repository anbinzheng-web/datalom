import { isAccountInput } from '@datalom/platform-runtime/contracts/index';
import type { CollectContext } from './collector.ts';
import { createHarvest, type Harvest } from './harvest.ts';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import type { Page } from 'playwright-core';

export function requireAccountMetrics(row: DataRow) {
  for (const key of ['plays', 'likes', 'commentsCount', 'favorites', 'shares'])
    if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
      throw new Error(`ACCOUNT_METRIC_MISSING:${key}`);
}

export function newestComments(rows: DataRow[], limit: number, ended: boolean): DataRow[] {
  if (!ended) throw new Error('LATEST_COMMENTS_INCOMPLETE');
  if (rows.some((row) => !Number.isSafeInteger(row.createdAt)))
    throw new Error('COMMENT_TIME_MISSING');
  return [...rows]
    .sort(
      (a, b) =>
        Number(b.createdAt) - Number(a.createdAt) ||
        String(b.commentId).localeCompare(String(a.commentId)),
    )
    .slice(0, limit);
}

export async function openAccountVideo(
  page: Page,
  harvest: Pick<Harvest, 'navigate' | 'scroll' | 'state'>,
  video: DataRow,
  accountUrl: string,
  signal: AbortSignal,
) {
  if (/\/(video|photo)\/\d+/.test(new URL(page.url()).pathname)) {
    const close = page.getByRole('button', { name: 'Close', exact: true });
    if (await close.isVisible()) {
      await close.click();
      await page.waitForURL((url) => url.pathname === new URL(accountUrl).pathname, {
        waitUntil: 'commit',
        timeout: 10000,
      });
    } else await harvest.navigate(accountUrl);
  }
  if (new URL(page.url()).pathname !== new URL(accountUrl).pathname)
    await harvest.navigate(accountUrl);
  const link = page.locator(`a[href="${video.url}"]`).first();
  for (let i = 0; i < 50; i++) {
    checkAbort(signal);
    if (await link.count()) {
      await link.click();
      await page.waitForURL((url) => url.pathname === new URL(String(video.url)).pathname, {
        // Cinema mode updates history while unrelated resources keep the document
        // interactive. Waiting for load misclassifies an open video as a dead browser.
        waitUntil: 'commit',
        timeout: 10000,
      });
      await page.getByRole('button', { name: 'Close', exact: true }).waitFor({
        state: 'visible',
        timeout: 10000,
      });
      await pause(600, signal);
      await harvest.state();
      return;
    }
    await harvest.scroll();
  }
  throw new Error('ACCOUNT_VIDEO_CARD_MISSING');
}

export async function readAccountComments(
  harvest: Harvest,
  limit: number,
  order: 'latest' | 'default',
  signal: AbortSignal,
): Promise<DataRow[]> {
  const rows = new Map<string, DataRow>();
  // Latest needs every accessible top-level comment, since the web list is relevance ordered.
  const deadline = Date.now() + 180000;
  let ended = false;
  let stalled = 0;
  while (Date.now() < deadline) {
    checkAbort(signal);
    const batch = await harvest.takePage('comments', rows.size ? 6000 : 12000);
    if (batch) {
      const before = rows.size;
      for (const row of batch.records) rows.set(String(row.commentId), row);
      ended = batch.ended === true;
      if (order === 'default' && rows.size >= limit) return [...rows.values()].slice(0, limit);
      if (ended) break;
      stalled = rows.size === before ? stalled + 1 : 0;
      if (rows.size >= 5000) break;
    } else stalled++;
    if (stalled >= 2) break;
    await harvest.state();
    await harvest.scroll();
  }
  if (order === 'latest') return newestComments([...rows.values()], limit, ended);
  if (!ended) throw new Error('COMMENT_PAGINATION_INCOMPLETE');
  return [...rows.values()].slice(0, limit);
}

export async function collectAccount(ctx: CollectContext) {
  const input = ctx.run.input;
  if (!isAccountInput(input)) throw new Error('SCRIPT_INPUT_MISMATCH');
  const { page, signal } = ctx;
  const harvest = createHarvest(page, signal, (sample) => {
    ctx.sample = sample;
  });
  const videos: DataRow[] = [];
  let saved = false;
  try {
    ctx.progress('读取账号主页');
    harvest.setPhase('account', new URL(input.accountUrl).pathname.slice(2));
    await harvest.navigate(input.accountUrl);
    let stalled = 0;
    const seen = new Set<string>();
    while (videos.length < input.videoLimit) {
      const result = await harvest.takePage('videos', 12000);
      if (result) {
        const before = videos.length;
        for (const row of result.records) {
          if (seen.has(String(row.videoId))) continue;
          seen.add(String(row.videoId));
          requireAccountMetrics(row);
          videos.push({
            ...row,
            rank: videos.length + 1,
            sourceAccount: input.accountUrl,
            statsSource: '/api/post/item_list/',
            qualifies: true,
          });
          if (videos.length >= input.videoLimit) break;
        }
        if (result.ended || videos.length >= input.videoLimit) break;
        stalled = videos.length === before ? stalled + 1 : 0;
      } else stalled++;
      await harvest.state();
      if (stalled >= 2) throw new Error('ACCOUNT_VIDEO_LIST_INCOMPLETE');
      await harvest.scroll();
    }
    // Visit every selected video even with comment details disabled. TikTok reuses the
    // post response for this modal; the exact API counters remain the source of truth.
    for (const video of videos) {
      ctx.progress(`读取视频统计 · ${video.rank}/${videos.length}`);
      await openAccountVideo(page, harvest, video, input.accountUrl, signal);
      ctx.emit('tiktok.videos', [{ ...video, detailVisited: true }]);
      saved = true;
    }
    const comments: DataRow[] = [];
    if (input.collectComments)
      for (const video of videos) {
        if (video.commentsCount === 0) continue;
        ctx.progress(
          `采集${input.commentOrder === 'latest' ? '最新评论' : '评论'} · ${video.rank}/${videos.length}`,
        );
        harvest.setPhase('comments', 'account-comments', String(video.videoId));
        await openAccountVideo(page, harvest, video, input.accountUrl, signal);
        const rows = await readAccountComments(
          harvest,
          input.commentsPerVideo,
          input.commentOrder,
          signal,
        );
        const annotated = rows.map((row, index) => ({
          ...row,
          rank: index + 1,
          commentOrder: input.commentOrder,
          sourceAccount: input.accountUrl,
        }));
        ctx.emit('tiktok.comments', annotated);
        comments.push(...annotated);
      }
    ctx.emit('tiktok.users', aggregate([], comments).users);
  } catch (error) {
    checkAbort(signal);
    const code = error instanceof Error ? error.message : 'ACCOUNT_COLLECTION_FAILED';
    if (saved && code !== 'HUMAN_REQUIRED' && !code.includes('COMMENT_'))
      throw new Error(`ACCOUNT_COLLECTION_INCOMPLETE:${code}`);
    throw error;
  } finally {
    harvest.stop();
  }
}
