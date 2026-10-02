import type { Page } from 'playwright-core';
import type { Harvest } from './harvest.ts';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import { searchUrl } from './tiktok-api.ts';

/** 8533acf6: direct document is Maintenance, while search -> author -> exact card works. */
export async function openCommentVideo(opts: {
  page: Page;
  harvest: Pick<Harvest, 'navigate' | 'state' | 'requireLogin' | 'scroll'>;
  url: string;
  signal: AbortSignal;
  progress: (step: string) => void;
  evidence: (value: unknown) => void;
}) {
  const { page, harvest, signal } = opts;
  await harvest.navigate(opts.url);
  try {
    await harvest.state();
    return;
  } catch (error) {
    checkAbort(signal);
    if (!(error instanceof Error) || error.message !== 'SITE_UNAVAILABLE') throw error;
    opts.progress('正在确认视频入口页面状态');
    await pause(2000, signal);
    try {
      await harvest.state();
      return;
    } catch (confirmed) {
      if (!(confirmed instanceof Error) || confirmed.message !== 'SITE_UNAVAILABLE')
        throw confirmed;
    }

    const match = /^\/@([a-zA-Z0-9_.]{1,24})\/(video|photo)\/(\d+)\/?$/.exec(
      new URL(page.url()).pathname,
    );
    if (!match) throw error;
    const [, handle, contentType, videoId] = match;
    opts.evidence({
      source: 'video-entry',
      videoId,
      navigation: { url: page.url(), title: await page.title(), code: error.message },
    });
    opts.progress('视频入口返回维护页，正在尝试站内打开');
    await harvest.navigate(searchUrl(handle));
    await harvest.requireLogin();
    // Inspect only existing site links. Never fabricate a link or click a different video.
    const findLink = (pathname: string) =>
      page
        .locator('a[href]')
        .filter({
          visible: true,
        })
        .evaluateAll((elements, expected) => {
          const link = elements.find((el) => {
            try {
              return (
                new URL((el as HTMLAnchorElement).href).pathname.replace(/\/$/, '') === expected
              );
            } catch {
              return false;
            }
          }) as HTMLAnchorElement | undefined;
          if (!link) return false;
          link.removeAttribute('target');
          link.click();
          return true;
        }, pathname);
    const targetPath = `/@${handle}/${contentType}/${videoId}`;
    let opened = false;
    let authorOpened = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      checkAbort(signal);
      if (await findLink(targetPath)) {
        opened = true;
        break;
      }
      if (await findLink(`/@${handle}`)) {
        authorOpened = true;
        break;
      }
      await harvest.state();
      await pause(500, signal);
    }
    if (!opened && !authorOpened) throw new Error('VIDEO_AUTHOR_LINK_MISSING');
    if (authorOpened) {
      if (new URL(page.url()).pathname !== `/@${handle}`) {
        try {
          await page.waitForURL((url) => url.pathname === `/@${handle}`, {
            waitUntil: 'commit',
            timeout: 10000,
          });
        } catch (waitError) {
          if (new URL(page.url()).pathname !== `/@${handle}`) throw waitError;
        }
      }
      // Wait for the real account cards, then use a bounded number of scrolls for older videos.
      for (let attempt = 0; attempt < 24; attempt++) {
        checkAbort(signal);
        if (await findLink(targetPath)) {
          opened = true;
          break;
        }
        if (attempt % 4 === 0) await harvest.state();
        if (attempt < 8) await pause(500, signal);
        else await harvest.scroll();
      }
    }
    if (!opened) throw new Error('VIDEO_TARGET_CARD_MISSING');
    if (new URL(page.url()).pathname !== targetPath) {
      try {
        await page.waitForURL((url) => url.pathname === targetPath, {
          waitUntil: 'commit',
          timeout: 10000,
        });
      } catch (waitError) {
        if (new URL(page.url()).pathname !== targetPath) throw waitError;
      }
    }
    await harvest.state();
    opts.progress('已进入目标视频，等待评论加载');
  }
}
