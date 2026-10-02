import type { Page } from 'playwright-core';
import { pause } from '@datalom/platform-runtime/pause';
import type { DataRow } from './youtube-parser.ts';
import type { YouTubeHarvest } from './youtube-harvest.ts';
import { searchUrl, videoIdFromUrl } from './youtube-api.ts';

async function clickSearchCard(page: Page, url: string): Promise<boolean> {
  const videoId = videoIdFromUrl(url);
  if (!videoId) return false;
  return page.evaluate((id) => {
    const href = [...document.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]')].find(
      (node) => (node as HTMLAnchorElement).href.includes(id),
    ) as HTMLAnchorElement | undefined;
    if (!href) return false;
    href.removeAttribute('target');
    href.click();
    return true;
  }, videoId);
}

async function openComments(page: Page, signal: AbortSignal) {
  await page.evaluate(() => {
    document.querySelector('#comments, ytd-comments, #comment-teaser')?.scrollIntoView({
      block: 'center',
    });
  });
  await pause(1200, signal);
}

export async function collectYouTubeComments(opts: {
  page: Page;
  harvest: YouTubeHarvest;
  signal: AbortSignal;
  videoId: string;
  url: string;
  keyword: string;
  limit: number;
  remaining: number;
  emit: (rows: DataRow[]) => void;
}): Promise<DataRow[]> {
  const { page, harvest, signal, videoId, url, emit } = opts;
  harvest.setPhase('comments', videoId, videoId);
  if (page.url().includes('/results') && (await clickSearchCard(page, url))) {
    await pause(1500, signal);
  } else {
    await harvest.navigate(url);
  }
  await harvest.state();
  await openComments(page, signal);
  const comments: DataRow[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + 25000;
  let stalled = 0;
  while (seen.size < opts.limit && comments.length < opts.remaining) {
    if (Date.now() > deadline) return comments;
    const result = await harvest.takePage('comments', comments.length ? 8000 : 15000);
    if (result) {
      const fresh: DataRow[] = [];
      for (const row of result.records) {
        const key = String(row.commentId);
        if (seen.has(key)) continue;
        seen.add(key);
        comments.push(row);
        fresh.push(row);
        if (seen.size === opts.limit || comments.length === opts.remaining) break;
      }
      emit(fresh);
      if (result.ended || seen.size >= opts.limit || comments.length >= opts.remaining) break;
      stalled = fresh.length ? 0 : stalled + 1;
      if (stalled >= 2) return comments;
      await harvest.state();
      await harvest.scroll();
      continue;
    }
    if (comments.length) return comments;
    stalled++;
    if (stalled >= 2) throw new Error('PAGE_RESPONSE_NOT_RECOGNIZED');
    await openComments(page, signal);
    await harvest.scroll();
  }
  return comments;
}

export async function returnToYouTubeSearch(
  harvest: YouTubeHarvest,
  keyword: string,
  signal: AbortSignal,
) {
  await harvest.navigate(searchUrl(keyword));
  await pause(800, signal);
}
