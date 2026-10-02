import type { Page } from 'playwright-core';
import type { DataRow } from './instagram-parser.ts';
import type { InstagramHarvest } from './instagram-harvest.ts';
import { INSTAGRAM_APP_ID, searchUrl } from './instagram-api.ts';
import { pause } from '@datalom/platform-runtime/pause';

async function triggerSearch(page: Page | undefined, keyword: string, signal?: AbortSignal) {
  if (!page) return;
  await page
    .evaluate(
      async ({ q, appId }) => {
        const csrf = document.cookie
          .split('; ')
          .find((part) => part.startsWith('csrftoken='))
          ?.slice('csrftoken='.length);
        await fetch(
          `https://www.instagram.com/api/v1/fbsearch/web/top_serp/?enable_metadata=true&query=${encodeURIComponent(q)}`,
          {
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'x-ig-app-id': appId,
              'x-requested-with': 'XMLHttpRequest',
              ...(csrf ? { 'x-csrftoken': csrf } : {}),
            },
          },
        ).catch(() => {});
      },
      { q: keyword, appId: INSTAGRAM_APP_ID },
    )
    .catch(() => {});
  if (signal) await pause(800, signal);
}

export async function searchInstagramMedia(opts: {
  page?: Page;
  harvest: InstagramHarvest;
  keyword: string;
  limit: number;
  minLikes: number | null;
  emit: (rows: DataRow[]) => void;
  signal?: AbortSignal;
}): Promise<DataRow[]> {
  const { page, harvest, keyword, limit, minLikes, emit, signal } = opts;
  harvest.setPhase('search', keyword);
  let navigationDone = false;
  const trackNav = harvest.navigate(searchUrl(keyword)).then(
    () => {
      navigationDone = true;
    },
    (error) => {
      navigationDone = true;
      throw error;
    },
  );
  const videos: DataRow[] = [];
  const seen = new Set<string>();
  let stalled = 0;
  let loginChecked = false;
  while (videos.length < limit) {
    const result = await harvest.takePage('videos', navigationDone ? 20000 : 12000);
    if (result) {
      const fresh: DataRow[] = [];
      for (const row of result.records) {
        const key = String(row.videoId);
        if (seen.has(key)) continue;
        seen.add(key);
        if (minLikes !== null && row.likes === null) throw new Error('REQUIRED_LIKES_MISSING');
        row.qualifies = minLikes === null || Number(row.likes) > minLikes;
        row.rank = videos.length + 1;
        videos.push(row);
        fresh.push(row);
        if (videos.length === limit) break;
      }
      emit(fresh);
      if (result.ended || videos.length === limit) break;
      stalled = fresh.length ? 0 : stalled + 1;
      if (stalled >= 3) throw new Error('PAGINATION_STALLED');
      if (!navigationDone) await trackNav;
      if (!loginChecked) {
        await harvest.requireLogin();
        loginChecked = true;
      }
      await harvest.state();
      await harvest.scroll();
      continue;
    }
    if (!navigationDone) await trackNav;
    if (!loginChecked) {
      await harvest.requireLogin();
      loginChecked = true;
    }
    await harvest.state();
    stalled++;
    if (stalled === 1) await triggerSearch(page, keyword, signal);
    if (stalled >= 3) throw new Error('PAGE_RESPONSE_NOT_RECOGNIZED');
    await harvest.scroll();
  }
  return videos;
}
