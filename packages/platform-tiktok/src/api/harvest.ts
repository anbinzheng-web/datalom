import type { Page, Response } from 'playwright-core';
import { tikTokSession } from './tiktok-session.ts';
import { parseTikTok, type ParsedPage } from '@datalom/platform-runtime/tiktok-parser';
import { redact } from '@datalom/platform-runtime/logging';
import { checkAbort, pause } from '@datalom/platform-runtime/pause';
import {
  isCommentListApi,
  isSearchPreviewApi,
  isSearchVideoApi,
  keywordMatches,
} from './tiktok-api.ts';

export type HarvestPhase = 'search' | 'comments' | 'account';

export type Harvest = {
  sample: unknown;
  navigationEvidence: Record<string, unknown> | null;
  setPhase: (phase: HarvestPhase, expected: string, videoId?: string) => void;
  navigate: (url: string) => Promise<void>;
  scroll: () => Promise<void>;
  state: () => Promise<string>;
  requireLogin: () => Promise<void>;
  takePage: (kind: 'videos' | 'comments', ms: number) => Promise<ParsedPage | null>;
  takeCommentSource: (ms: number) => Promise<{ url: string; body: unknown } | null>;
  stop: () => void;
};

export function createHarvest(
  page: Page,
  signal: AbortSignal,
  onSample?: (sample: unknown) => void,
): Harvest {
  let phase: HarvestPhase = 'search';
  let expected = '';
  let videoId: string | undefined;
  let sequence = 0;
  let pending: ParsedPage[] = [];
  let failure: Error | undefined;
  let listening = true;
  const readers = new Set<Promise<void>>();
  let sample: unknown;
  let navigationEvidence: Record<string, unknown> | null = null;
  let commentSource: { url: string; body: unknown } | null = null;

  const receive = async (response: Response) => {
    const generation = sequence,
      target = expected,
      selectedVideo = videoId,
      current = phase;
    try {
      const url = new URL(response.url());
      if (!listening || !['www.tiktok.com', 'www.tiktokv.com'].includes(url.hostname)) return;
      const resource = response.request().resourceType();
      if (resource === 'document' && response.frame() === page.mainFrame()) {
        const headers = response.headers();
        navigationEvidence = {
          path: url.pathname,
          httpStatus: response.status(),
          server: headers.server ?? null,
          contentType: headers['content-type'] ?? null,
          observedAt: new Date().toISOString(),
        };
        return;
      }
      if (!['xhr', 'fetch', 'other'].includes(resource)) return;
      if (isSearchPreviewApi(url.pathname)) return;
      const post = response.request().postData();
      if (current === 'search') {
        if (!isSearchVideoApi(url.pathname)) return;
        if (
          (url.searchParams.has('keyword') || url.searchParams.has('q') || post) &&
          !keywordMatches(url, post, target)
        )
          return;
      } else if (current === 'account') {
        if (url.pathname !== '/api/post/item_list/') return;
      } else {
        if (!isCommentListApi(url.pathname)) return;
        const aweme = url.searchParams.get('aweme_id');
        if (aweme && aweme !== selectedVideo) return;
        if (
          current === 'comments' &&
          target === 'account-comments' &&
          url.pathname !== '/api/comment/list/'
        )
          return;
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
      if (!response.headers()['content-type']?.includes('json')) return;
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
      sample = { source: url.pathname, videoId: selectedVideo ?? null, body: redact(body) };
      onSample?.(sample);
      if (
        current === 'comments' &&
        url.pathname === '/api/comment/list/' &&
        url.searchParams.get('aweme_id') === selectedVideo &&
        (url.searchParams.get('cursor') ?? '0') === '0' &&
        !commentSource
      )
        commentSource = { url: response.url(), body };
      if (current === 'account' && (body.statusCode ?? body.status_code ?? 0) !== 0)
        throw new Error('ACCOUNT_UNAVAILABLE');
      const parsed = parseTikTok(
        body,
        new Date().toISOString(),
        current === 'comments' ? selectedVideo : undefined,
      );
      if (parsed) {
        if (
          current === 'account' &&
          parsed.records.some(
            (row) => String(row.authorHandle).toLowerCase() !== target.toLowerCase(),
          )
        )
          return;
        if (pending.length >= 100) throw new Error('RESPONSE_QUEUE_FULL');
        pending.push(parsed);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (generation !== sequence || !listening) return;
      if (['COMMENT_VIDEO_MISMATCH', 'COMMENT_ID_MISSING', 'VIDEO_ID_MISSING'].includes(code))
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

  const harvest: Harvest = {
    get navigationEvidence() {
      return navigationEvidence;
    },
    get sample() {
      return sample;
    },
    setPhase(next, value, id) {
      phase = next;
      expected = value;
      videoId = id;
      sequence++;
      pending = [];
      commentSource = null;
      failure = undefined;
    },
    async navigate(url) {
      try {
        await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      } catch (error) {
        throw error instanceof Error ? error : new Error('NAVIGATION_FAILED');
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
      const session = await tikTokSession(page);
      if (session === 'login_required') throw new Error('LOGIN_REQUIRED');
      if (session === 'needs_human') throw new Error('HUMAN_REQUIRED');
      if (session === 'site_unavailable') throw new Error('SITE_UNAVAILABLE');
      return session;
    },
    async requireLogin() {
      const until = Date.now() + 10000;
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
    async takeCommentSource(ms) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        checkAbort(signal);
        if (failure) throw failure;
        if (commentSource) return commentSource;
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
