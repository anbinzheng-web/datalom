import type { Page, Response } from 'playwright-core';
import { instagramAppReady, instagramSession } from './instagram-session.ts';
import { parseInstagram, type ParsedPage } from './instagram-parser.ts';
import { redact } from '@datalom/platform-runtime/logging';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import {
  commentMediaId,
  friendlyNameOf,
  isCommentListApi,
  isInstagramHost,
  isSearchMediaApi,
  isJsonContentType,
  isSearchPreviewApi,
  keywordMatches,
} from './instagram-api.ts';

export type InstagramHarvestPhase = 'search' | 'comments';

export type InstagramHarvest = {
  sample: unknown;
  setPhase: (phase: InstagramHarvestPhase, expected: string, videoId?: string) => void;
  navigate: (url: string) => Promise<void>;
  scroll: () => Promise<void>;
  state: () => Promise<string>;
  requireLogin: () => Promise<void>;
  takePage: (kind: 'videos' | 'comments', ms: number) => Promise<ParsedPage | null>;
  stop: () => void;
};

export function createInstagramHarvest(
  page: Page,
  signal: AbortSignal,
  onSample?: (sample: unknown) => void,
): InstagramHarvest {
  let phase: InstagramHarvestPhase = 'search';
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
      if (!listening || !isInstagramHost(url.hostname)) return;
      const resource = response.request().resourceType();
      if (!['xhr', 'fetch', 'other'].includes(resource)) return;
      const post = response.request().postData();
      const headers = response.request().headers();
      const friendly = friendlyNameOf(url, post, headers);
      if (isSearchPreviewApi(url.pathname, friendly)) return;
      if (current === 'search') {
        const graphql = /\/graphql\/query|\/api\/graphql/i.test(url.pathname);
        const searchHit = isSearchMediaApi(url.pathname, friendly);
        if (!searchHit && !(graphql && keywordMatches(url, post, target))) return;
        if (
          searchHit &&
          (url.searchParams.has('query') || url.searchParams.has('q') || post) &&
          !keywordMatches(url, post, target) &&
          !/search|serp|hashtag/i.test(friendly)
        )
          return;
      } else {
        if (!isCommentListApi(url.pathname, friendly)) return;
        const media = commentMediaId(url.pathname);
        if (media && selectedVideo && media !== selectedVideo) return;
      }
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
          timer = setTimeout(() => reject(new Error('RESPONSE_TIMEOUT')), 8000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (bytes.length > 2 * 1024 * 1024) {
        failure = new Error('RESPONSE_TOO_LARGE');
        return;
      }
      const body = JSON.parse(bytes.toString('utf8'));
      if (generation !== sequence || !listening) return;
      if (body?.message === 'login_required' || body?.require_login === true) {
        return;
      }
      if (body?.message === 'checkpoint_required' || body?.challenge_required === true) {
        failure = new Error('HUMAN_REQUIRED');
        return;
      }
      sample = { source: url.pathname, videoId: selectedVideo ?? null, body: redact(body) };
      onSample?.(sample);
      const parsed = parseInstagram(
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
      if (
        [
          'COMMENT_VIDEO_MISMATCH',
          'COMMENT_ID_MISSING',
          'VIDEO_ID_MISSING',
          'RESPONSE_TIMEOUT',
        ].includes(code)
      )
        return;
      failure = error instanceof Error ? error : new Error('RESPONSE_PARSE_FAILED');
    }
  };

  const listener = (response: Response) => {
    const promise = receive(response);
    readers.add(promise);
    void promise.finally(() => readers.delete(promise));
  };
  page.on('response', listener);

  const harvest: InstagramHarvest = {
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
        await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      } catch (error) {
        throw error instanceof Error ? error : new Error('NAVIGATION_FAILED');
      }
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        checkAbort(signal);
        if (await instagramAppReady(page)) return;
        await pause(250, signal);
      }
    },
    async scroll() {
      await page.evaluate(() => {
        const elements = [
          document.scrollingElement,
          ...document.querySelectorAll('main,section,div'),
        ].filter((e): e is Element => !!e);
        const candidates = elements.filter(
          (e) =>
            e.scrollHeight > e.clientHeight + 100 &&
            e.clientHeight > 100 &&
            e.getBoundingClientRect().width > 150 &&
            ['auto', 'scroll'].includes(getComputedStyle(e).overflowY),
        );
        const target =
          candidates.sort(
            (a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth,
          )[0] ?? document.scrollingElement;
        target?.scrollBy(0, Math.max(500, target.clientHeight * 0.8));
      });
      await pause(1200, signal);
    },
    async state() {
      checkAbort(signal);
      if (failure) throw failure;
      const session = await instagramSession(page);
      if (session === 'login_required') throw new Error('LOGIN_REQUIRED');
      if (session === 'needs_human') throw new Error('HUMAN_REQUIRED');
      if (session === 'site_unavailable') throw new Error('SITE_UNAVAILABLE');
      return session;
    },
    async requireLogin() {
      const until = Date.now() + 20000;
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
