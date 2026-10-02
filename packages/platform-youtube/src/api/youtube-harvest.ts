import type { Page, Response } from 'playwright-core';
import { youtubeSession } from './youtube-session.ts';
import { parseYouTube, type ParsedPage } from './youtube-parser.ts';
import { redact } from '@datalom/platform-runtime/logging';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import {
  isCommentApi,
  isJsonContentType,
  isSearchApi,
  isYouTubeHost,
  keywordMatches,
} from './youtube-api.ts';

export type YouTubeHarvestPhase = 'search' | 'comments';

export type YouTubeHarvest = {
  sample: unknown;
  setPhase: (phase: YouTubeHarvestPhase, expected: string, videoId?: string) => void;
  navigate: (url: string) => Promise<void>;
  scroll: () => Promise<void>;
  state: () => Promise<string>;
  requireLogin: () => Promise<void>;
  takePage: (kind: 'videos' | 'comments', ms: number) => Promise<ParsedPage | null>;
  stop: () => void;
};

export function createYouTubeHarvest(
  page: Page,
  signal: AbortSignal,
  onSample?: (sample: unknown) => void,
): YouTubeHarvest {
  let phase: YouTubeHarvestPhase = 'search';
  let expected = '';
  let videoId: string | undefined;
  let sequence = 0;
  let pending: ParsedPage[] = [];
  let failure: Error | undefined;
  let listening = true;
  const readers = new Set<Promise<void>>();
  let sample: unknown;

  const receive = async (response: Response) => {
    const generation = sequence,
      target = expected,
      selectedVideo = videoId,
      current = phase;
    try {
      const url = new URL(response.url());
      if (!listening || !isYouTubeHost(url.hostname)) return;
      const resource = response.request().resourceType();
      if (!['xhr', 'fetch', 'other'].includes(resource)) return;
      const post = response.request().postData();
      if (current === 'search') {
        if (!isSearchApi(url.pathname)) return;
        if (post && !keywordMatches(url, post, target) && !/continuation/i.test(post)) return;
      } else if (!isCommentApi(url.pathname)) return;
      if (response.status() === 429) {
        failure = new Error('SITE_RATE_LIMITED');
        return;
      }
      if (response.status() === 401) {
        failure = new Error('LOGIN_REQUIRED');
        return;
      }
      if (!response.ok()) return;
      if (!isJsonContentType(response.headers()['content-type'])) return;
      if (Number(response.headers()['content-length'] ?? 0) > 2 * 1024 * 1024) return;
      let timer: NodeJS.Timeout | undefined;
      const bytes = await Promise.race([
        response.body(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('RESPONSE_TIMEOUT')), 15000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (bytes.length > 2 * 1024 * 1024) return;
      const body = JSON.parse(bytes.toString('utf8'));
      if (generation !== sequence || !listening) return;
      sample = { source: url.pathname, videoId: selectedVideo ?? null, body: redact(body) };
      onSample?.(sample);
      const parsed = parseYouTube(
        body,
        new Date().toISOString(),
        current === 'comments' ? selectedVideo : undefined,
      );
      if (parsed) {
        if (pending.length >= 100) throw new Error('RESPONSE_QUEUE_FULL');
        pending.push(parsed);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (generation !== sequence || !listening) return;
      if (['RESPONSE_TIMEOUT', 'COMMENT_VIDEO_MISMATCH', 'VIDEO_ID_MISSING'].includes(code)) return;
      failure = error instanceof Error ? error : new Error('RESPONSE_PARSE_FAILED');
    }
  };

  const listener = (response: Response) => {
    const promise = receive(response);
    readers.add(promise);
    void promise.finally(() => readers.delete(promise));
  };
  page.on('response', listener);

  const harvest: YouTubeHarvest = {
    get sample() {
      return sample;
    },
    setPhase(next, value, id) {
      phase = next;
      expected = value;
      videoId = id;
      sequence++;
      pending = [];
      failure = undefined;
    },
    async navigate(url) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (error) {
        throw error instanceof Error ? error : new Error('NAVIGATION_FAILED');
      }
    },
    async scroll() {
      await page.evaluate(() => {
        const comments = document.querySelector('#comments, ytd-comments');
        if (comments) comments.scrollIntoView({ block: 'center' });
        const target = document.scrollingElement ?? document.documentElement;
        target.scrollBy(0, Math.max(600, target.clientHeight * 0.9));
      });
      await pause(1200, signal);
    },
    async state() {
      checkAbort(signal);
      if (failure) throw failure;
      const session = await youtubeSession(page);
      if (session === 'login_required') throw new Error('LOGIN_REQUIRED');
      if (session === 'needs_human') throw new Error('HUMAN_REQUIRED');
      if (session === 'site_unavailable') throw new Error('SITE_UNAVAILABLE');
      return session;
    },
    async requireLogin() {
      const until = Date.now() + 15000;
      while (Date.now() < until) {
        if ((await harvest.state()) === 'ready') return;
        await pause(250, signal);
      }
      throw new Error('LOGIN_STATE_UNKNOWN');
    },
    async takePage(kind, ms) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        checkAbort(signal);
        if (failure) throw failure;
        const index = pending.findIndex((p) => p.kind === kind);
        if (index >= 0) return pending.splice(index, 1)[0];
        await pause(100, signal);
      }
      return null;
    },
    stop() {
      listening = false;
      page.off('response', listener);
    },
  };
  return harvest;
}
