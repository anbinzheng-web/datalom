import type { Page } from 'playwright-core';
import { pause } from '@datalom/platform-runtime/pause';
import type { DataRow } from './instagram-parser.ts';
import type { InstagramHarvest } from './instagram-harvest.ts';
import { searchUrl, shortcodeFromUrl } from './instagram-api.ts';

async function clickSearchCard(
  page: Page,
  harvest: InstagramHarvest,
  signal: AbortSignal,
  url: string,
): Promise<boolean> {
  const code = shortcodeFromUrl(url);
  if (!code) return false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const clicked = await page.evaluate((shortcode) => {
      const href = [
        ...document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]'),
      ].find((node) => {
        try {
          return decodeURIComponent((node as HTMLAnchorElement).href).includes(`/${shortcode}`);
        } catch {
          return (node as HTMLAnchorElement).href.includes(shortcode);
        }
      }) as HTMLAnchorElement | undefined;
      if (!href) return false;
      href.removeAttribute('target');
      href.click();
      return true;
    }, code);
    if (clicked) {
      await pause(1500, signal);
      return true;
    }
    await harvest.scroll();
  }
  return false;
}

async function openCommentsPanel(page: Page, signal: AbortSignal) {
  const clicked = await page.evaluate(() => {
    const selectors = [
      'svg[aria-label="Comment"]',
      'svg[aria-label="评论"]',
      'svg[aria-label="Kommentar"]',
      'button[aria-label*="comment" i]',
      'span[aria-label*="comment" i]',
    ];
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      if (el) {
        const target =
          (el.closest('button, a, div[role="button"]') as HTMLElement | null) ??
          (el as HTMLElement);
        target.click();
        return selector;
      }
    }
    return null;
  });
  if (clicked) await pause(1200, signal);
}

async function openMedia(
  page: Page,
  harvest: InstagramHarvest,
  signal: AbortSignal,
  url: string,
  keyword: string,
) {
  if (page.url().includes('/explore/search') && (await clickSearchCard(page, harvest, signal, url)))
    return;
  await harvest.navigate(url);
  try {
    await harvest.state();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'SITE_UNAVAILABLE') throw error;
    await harvest.navigate(searchUrl(keyword));
    await pause(800, signal);
    if (!(await clickSearchCard(page, harvest, signal, url))) throw error;
  }
}

export async function collectInstagramComments(opts: {
  page: Page;
  harvest: InstagramHarvest;
  signal: AbortSignal;
  videoId: string;
  url: string;
  keyword: string;
  limit: number;
  remaining: number;
  emit: (rows: DataRow[]) => void;
}): Promise<DataRow[]> {
  const { page, harvest, signal, videoId, url, keyword, emit } = opts;
  harvest.setPhase('comments', videoId, videoId);
  await openMedia(page, harvest, signal, url, keyword);
  await harvest.state();
  await openCommentsPanel(page, signal);
  const comments: DataRow[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + 25000;
  let stalled = 0;
  while (seen.size < opts.limit && comments.length < opts.remaining) {
    if (Date.now() > deadline) return comments;
    const result = await harvest.takePage('comments', comments.length ? 6000 : 12000);
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
      if (stalled >= 2) {
        if (comments.length) return comments;
        throw new Error('PAGINATION_STALLED');
      }
      await harvest.state();
      await harvest.scroll();
      continue;
    }
    if (comments.length) return comments;
    stalled++;
    if (stalled >= 2) throw new Error('PAGE_RESPONSE_NOT_RECOGNIZED');
    await openCommentsPanel(page, signal);
    await harvest.scroll();
  }
  return comments;
}

export async function returnToInstagramSearch(
  harvest: InstagramHarvest,
  keyword: string,
  signal: AbortSignal,
) {
  await harvest.navigate(searchUrl(keyword));
  await pause(800, signal);
}
