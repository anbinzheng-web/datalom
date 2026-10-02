import assert from 'node:assert/strict';
import { test } from 'vitest';
import { keywordInput } from '@datalom/platform-runtime/contracts/index';
import { collectServerKeyword } from '../api/server-keyword.ts';
import { keywordApiFixture } from '@datalom/platform-runtime/fixtures/keyword-api';

const input = keywordInput.parse({
  keyword: 'jeans',
  videoLimit: 3,
  commentsPerVideo: 3,
  totalComments: 4,
});
const fixtureFetch = async (url: string) => {
  const response = keywordApiFixture(new URL(url));
  return { status: response.status, text: JSON.stringify(response.body) };
};
const options = () => ({
  input,
  template: 'https://www.tiktok.com/api/search/general/full/?aid=1988&keyword=jeans&cursor=0',
  maxPages: 100,
  signal: new AbortController().signal,
  fetch: fixtureFetch,
  evidence: (_entry: Record<string, unknown>) => {},
  progress: () => {},
});

test('server keyword preserves five datasets, threshold, dedup and budgets without a browser', async () => {
  const requests: URL[] = [];
  const result = await collectServerKeyword({
    ...options(),
    fetch: async (url) => {
      requests.push(new URL(url));
      return fixtureFetch(url);
    },
  });
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.datasets['tiktok.videos']!.map((r) => [r.videoId, r.qualifies]),
    [
      ['1', true],
      ['2', false],
      ['3', true],
    ],
  );
  assert.deepEqual(
    result.datasets['tiktok.comments']!.map((r) => r.commentId),
    ['11', '12', '13', '31'],
  );
  assert.equal(result.datasets['tiktok.users']!.length, 3);
  assert.equal(result.datasets['tiktok.tags']!.length, 1);
  assert.equal(result.datasets['tiktok.keyword-evidence']!.length, 1);
  assert.equal(requests.length, 5);
  assert.equal(
    requests.some((u) => u.searchParams.get('aweme_id') === '2'),
    false,
  );
  assert.doesNotMatch(JSON.stringify(result), /RAW_API_CANARY/);
});

test('later transport failure retains partial records and does not retry or change executor', async () => {
  const evidence: Record<string, unknown>[] = [];
  const result = await collectServerKeyword({
    ...options(),
    evidence: (e) => evidence.push(e),
    fetch: async (url) => {
      const u = new URL(url);
      return u.pathname.includes('/comment/') && u.searchParams.get('cursor') === '20'
        ? { status: 429, text: 'limited' }
        : fixtureFetch(url);
    },
  });
  assert.equal(result.error, 'RATE_LIMITED');
  assert.equal(result.complete, false);
  assert.equal(result.requests, 4);
  assert.equal(result.datasets['tiktok.comments']!.length, 2);
  assert.equal(result.datasets['tiktok.users']!.length, 2);
  assert.ok(evidence.some((e) => e.status === 429));
});

test('server page budget and cancellation stop with retained search output', async () => {
  const limited = await collectServerKeyword({ ...options(), maxPages: 1 });
  assert.equal(limited.error, 'PAGE_LIMIT');
  assert.equal(limited.datasets['tiktok.videos']!.length, 2);
  const controller = new AbortController();
  const cancelled = await collectServerKeyword({
    ...options(),
    signal: controller.signal,
    progress: () => controller.abort(),
  });
  assert.equal(cancelled.complete, false);
  assert.equal(cancelled.requests, 1);
  assert.equal(cancelled.datasets['tiktok.videos']!.length, 2);
});

test('search business reject records status without keeping videos', async () => {
  const evidence: Record<string, unknown>[] = [];
  const result = await collectServerKeyword({
    ...options(),
    evidence: (entry) => evidence.push(entry),
    fetch: async () => ({
      status: 200,
      text: JSON.stringify({
        status_code: 2483,
        status_msg: 'verify',
        data: [],
        has_more: 0,
      }),
    }),
  });
  assert.equal(result.error, 'SEARCH_API_REJECTED');
  assert.equal(result.complete, false);
  assert.equal(result.datasets['tiktok.videos']!.length, 0);
  const search = evidence.find((entry) => entry.path === '/api/search/general/full/');
  assert.equal(search?.status, 200);
  assert.equal(search?.businessStatus, 2483);
  assert.equal(search?.statusMsg, 'verify');
});

test('missing search context never issues a bare request', async () => {
  const result = await collectServerKeyword({
    ...options(),
    template: undefined,
    fetch: async () => {
      assert.fail('must not send unsigned minimal fallback');
    },
  });
  assert.equal(result.error, 'SEARCH_CONTEXT_REQUIRED');
  assert.equal(result.requests, 0);
  assert.equal(result.complete, false);
});

test('JEV filters before comment requests, keeps rejected videos and continues to relevant candidates', async () => {
  const checked: unknown[] = [];
  const requested: string[] = [];
  const result = await collectServerKeyword({
    ...options(),
    relevance: async (row) => {
      checked.push(row.videoId);
      return row.videoId === '1' ? 'irrelevant' : 'relevant';
    },
    fetch: async (url) => {
      const video = new URL(url).searchParams.get('aweme_id');
      if (video) requested.push(video);
      return fixtureFetch(url);
    },
  });
  assert.equal(result.complete, true);
  assert.deepEqual(checked, ['1', '3']);
  assert.ok(requested.length > 0);
  assert.ok(requested.every((id) => id === '3'));
  assert.equal(result.datasets['tiktok.videos']!.length, 3);
  assert.equal(result.datasets['tiktok.videos']![0].keywordRelevance, 'irrelevant');
  assert.equal(result.datasets['tiktok.videos']![0].qualifies, true);
});

test('uncertain videos skip comments; a JEV failure stops with retained search data', async () => {
  for (const fails of [false, true]) {
    let commentRequests = 0;
    const result = await collectServerKeyword({
      ...options(),
      relevance: async () => {
        if (fails) throw new Error('JEV_VIDEO_FILTER_FAILED');
        return 'uncertain';
      },
      fetch: async (url) => {
        if (new URL(url).pathname.includes('/comment/')) commentRequests++;
        return fixtureFetch(url);
      },
    });
    assert.equal(commentRequests, 0);
    assert.equal(result.complete, !fails);
    assert.equal(result.error, fails ? 'JEV_VIDEO_FILTER_FAILED' : null);
    assert.equal(result.datasets['tiktok.videos']!.length, 3);
    assert.equal(
      result.datasets['tiktok.videos']![0].keywordRelevance,
      fails ? 'failed' : 'uncertain',
    );
  }
});
