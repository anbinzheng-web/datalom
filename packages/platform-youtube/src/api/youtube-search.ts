import type { Page } from 'playwright-core';
import type { DataRow } from './youtube-parser.ts';
import type { YouTubeHarvest } from './youtube-harvest.ts';
import { searchUrl } from './youtube-api.ts';
import { pause } from '@datalom/platform-runtime/pause';

async function triggerSearch(page: Page | undefined, keyword: string, signal?: AbortSignal) {
  if (!page) return;
  await page
    .evaluate(async (q) => {
      const cfg =
        (window as unknown as { ytcfg?: { data_?: { INNERTUBE_CLIENT_VERSION?: string } } }).ytcfg
          ?.data_ ?? {};
      await fetch('/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: cfg.INNERTUBE_CLIENT_VERSION || '2.20240101.00.00',
              hl: 'en',
            },
          },
          query: q,
        }),
      }).catch(() => {});
    }, keyword)
    .catch(() => {});
  if (signal) await pause(800, signal);
}

export async function searchYouTubeVideos(opts: {
  page?: Page;
  harvest: YouTubeHarvest;
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
        // Search cards often omit likes; missing counts do not fail the run.
        row.qualifies = minLikes === null || row.likes == null || Number(row.likes) > minLikes;
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
