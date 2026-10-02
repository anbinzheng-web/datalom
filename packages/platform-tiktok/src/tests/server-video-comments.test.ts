import assert from 'node:assert/strict';
import { test } from 'vitest';
import { reportSchema, videoCommentsInput } from '@datalom/platform-runtime/contracts/business';
import { cloudTaskSchema } from '@datalom/platform-runtime/contracts/cloud-tasks';
import {
  collectServerVideoComments,
  videoCommentsBootstrapKeyword,
  videoIdFromUrl,
} from '../api/server-video-comments.ts';
import { keywordCommentReplyUrl } from '../api/keyword-api.ts';
import { createRecoveringKeywordSession } from '../api/server-keyword-recovery.ts';

const taskBase = {
  taskId: 'task',
  ownerId: 'owner',
  name: 'comments',
  platform: 'TikTok' as const,
  createdAt: new Date().toISOString(),
};
const apiExecution = {
  kind: 'server-api' as const,
  operation: 'video-comments' as const,
  maxPages: 100,
};

test('video comment helpers parse standard TikTok URLs', () => {
  const url = 'https://www.tiktok.com/@reader/video/1234567890123456789';
  assert.equal(videoIdFromUrl(url), '1234567890123456789');
  assert.equal(videoCommentsBootstrapKeyword(url), 'reader');
  assert.ok(videoCommentsInput.parse({ kind: 'video-comments', videoUrl: url }));
  const photo = 'https://www.tiktok.com/@reader/photo/123';
  assert.equal(videoIdFromUrl(photo), '123');
  assert.equal(videoCommentsBootstrapKeyword(photo), 'reader');
});

test('API video comments accept full video or photo links and reject short links', () => {
  const video = {
    ...taskBase,
    execution: apiExecution,
    input: {
      kind: 'video-comments' as const,
      videoUrl: 'https://www.tiktok.com/@reader/video/1',
      maxComments: 500,
      maxMinutes: 60,
    },
  };
  assert.ok(cloudTaskSchema.safeParse(video).success);
  assert.ok(
    cloudTaskSchema.safeParse({
      ...video,
      input: { ...video.input, videoUrl: 'https://www.tiktok.com/@reader/photo/1' },
    }).success,
  );
  assert.equal(
    cloudTaskSchema.safeParse({
      ...video,
      input: { ...video.input, videoUrl: 'https://vm.tiktok.com/ABC123' },
    }).success,
    false,
  );
  assert.ok(
    cloudTaskSchema.safeParse({
      ...taskBase,
      execution: { kind: 'client-browser' },
      input: { ...video.input, videoUrl: 'https://vm.tiktok.com/ABC123' },
    }).success,
  );
});

test('video comment reports keep startedAt so execution duration can be recovered', () => {
  const startedAt = '2026-09-18T10:00:00.000Z';
  const finishedAt = '2026-09-18T10:02:30.000Z';
  const parsed = reportSchema.safeParse({
    schemaVersion: 1,
    deviceId: 'server-api',
    runId: 'run',
    attemptId: 'run',
    taskId: 'task',
    scriptId: 'tiktok.video-comments',
    scriptVersion: 'server-api-1.0.0',
    input: {
      kind: 'video-comments',
      videoUrl: 'https://www.tiktok.com/@reader/video/1',
      maxComments: 200,
      maxMinutes: 60,
    },
    collectionStatus: 'succeeded',
    createdAt: '2026-09-18T09:59:50.000Z',
    startedAt,
    finishedAt,
    resultComplete: true,
    counts: { 'tiktok.comments': 1 },
    error: null,
    files: [
      {
        name: 'batch-000001.json',
        dataset: 'tiktok.comments',
        count: 1,
        bytes: 12,
        sha256: 'a'.repeat(64),
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.startedAt, startedAt);
});

test('server video comments collect top-level records through signed comment URLs', async () => {
  const requests: string[] = [];
  const result = await collectServerVideoComments({
    input: videoCommentsInput.parse({
      kind: 'video-comments',
      videoUrl: 'https://www.tiktok.com/@reader/video/1',
      maxComments: 10,
    }),
    template:
      'https://www.tiktok.com/api/search/general/full/?aid=1988&device_id=1&keyword=x&cursor=0',
    bootstrapKeyword: 'reader',
    maxPages: 10,
    signal: new AbortController().signal,
    fetch: async (url) => {
      requests.push(url);
      const target = new URL(url);
      const page = target.searchParams.get('cursor') === '0' ? 0 : 1;
      return {
        status: 200,
        text: JSON.stringify({
          status_code: 0,
          cursor: page === 0 ? 20 : 40,
          has_more: page === 0 ? 1 : 0,
          comments: [
            {
              cid: `c${page}`,
              aweme_id: '1',
              text: 'hello',
              reply_comment_total: 0,
              user: { uid: 'u1' },
            },
          ],
        }),
      };
    },
    evidence: () => {},
    progress: () => {},
  });
  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.equal(result.datasets['tiktok.comments']?.length, 2);
  assert.equal(result.datasets['tiktok.users']?.length, 1);
  assert.ok(requests.every((url) => url.includes('/api/comment/list/')));
});

test('keyword reply URLs keep the reply endpoint and parent comment id', () => {
  const url = new URL(
    keywordCommentReplyUrl(
      'https://www.tiktok.com/api/search/general/full/?aid=1988&device_id=1&keyword=x&cursor=0',
      'x',
      '1',
      '9',
      '0',
    ),
  );
  assert.equal(url.pathname, '/api/comment/list/reply/');
  assert.equal(url.searchParams.get('item_id'), '1');
  assert.equal(url.searchParams.get('comment_id'), '9');
});

test('recovering session signs comment replies instead of rejecting the reply endpoint', async () => {
  const paths: string[] = [];
  const session = await createRecoveringKeywordSession({
    keyword: 'reader',
    signal: new AbortController().signal,
    maxRequests: 10,
    candidates: () => ['A'],
    wait: async () => {},
    evidence: () => {},
    open: async () => ({
      template:
        'https://www.tiktok.com/api/search/general/full/?keyword=reader&cursor=0&device_id=A',
      close: () => {},
      fetch: async (url) => {
        const target = new URL(url);
        paths.push(target.pathname);
        if (target.pathname === '/api/comment/list/reply/') {
          assert.equal(target.searchParams.get('item_id'), '1');
          assert.equal(target.searchParams.get('comment_id'), '9');
          return {
            status: 200,
            text: JSON.stringify({
              status_code: 0,
              cursor: 3,
              has_more: 0,
              comments: [
                {
                  cid: '10',
                  aweme_id: '1',
                  text: 'reply',
                  reply_id: '9',
                  user: { uid: 'u2' },
                },
              ],
            }),
          };
        }
        return {
          status: 200,
          text: JSON.stringify({
            status_code: 0,
            cursor: 20,
            has_more: 0,
            comments: [
              {
                cid: '9',
                aweme_id: '1',
                text: 'hello',
                reply_comment_total: 1,
                user: { uid: 'u1' },
              },
            ],
          }),
        };
      },
    }),
  });
  try {
    const result = await collectServerVideoComments({
      input: videoCommentsInput.parse({
        kind: 'video-comments',
        videoUrl: 'https://www.tiktok.com/@reader/video/1',
        maxComments: 10,
      }),
      template: session.template,
      bootstrapKeyword: 'reader',
      maxPages: 10,
      signal: new AbortController().signal,
      fetch: session.fetch,
      evidence: () => {},
      progress: () => {},
    });
    assert.equal(result.error, null);
    assert.equal(result.complete, true);
    assert.equal(result.datasets['tiktok.comments']?.length, 2);
    assert.deepEqual(paths, ['/api/comment/list/', '/api/comment/list/reply/']);
  } finally {
    await session.close();
  }
});

test('server video comments treat a reached comment budget as complete', async () => {
  const result = await collectServerVideoComments({
    input: videoCommentsInput.parse({
      kind: 'video-comments',
      videoUrl: 'https://www.tiktok.com/@reader/video/1',
      maxComments: 1,
    }),
    template:
      'https://www.tiktok.com/api/search/general/full/?aid=1988&device_id=1&keyword=x&cursor=0',
    bootstrapKeyword: 'reader',
    maxPages: 10,
    signal: new AbortController().signal,
    fetch: async () => ({
      status: 200,
      text: JSON.stringify({
        status_code: 0,
        cursor: 20,
        has_more: 1,
        comments: [
          { cid: 'c1', aweme_id: '1', text: 'one', reply_comment_total: 0, user: { uid: 'u1' } },
          { cid: 'c2', aweme_id: '1', text: 'two', reply_comment_total: 0, user: { uid: 'u2' } },
        ],
      }),
    }),
    evidence: () => {},
    progress: () => {},
  });
  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.equal(result.datasets['tiktok.comments']?.length, 1);
});

test('ended first-level reply chains do not fail the run when TikTok advertised more replies', async () => {
  const evidence: Record<string, unknown>[] = [];
  const result = await collectServerVideoComments({
    input: videoCommentsInput.parse({
      kind: 'video-comments',
      videoUrl: 'https://www.tiktok.com/@reader/video/1',
      maxComments: 200,
    }),
    template:
      'https://www.tiktok.com/api/search/general/full/?aid=1988&device_id=1&keyword=x&cursor=0',
    bootstrapKeyword: 'reader',
    maxPages: 20,
    signal: new AbortController().signal,
    fetch: async (url) => {
      const target = new URL(url);
      if (target.pathname === '/api/comment/list/reply/') {
        assert.equal(target.searchParams.get('comment_id'), '9');
        return {
          status: 200,
          text: JSON.stringify({
            status_code: 0,
            cursor: 3,
            has_more: 0,
            comments: Array.from({ length: 2 }, (_, i) => ({
              cid: String(10 + i),
              aweme_id: '1',
              text: 'reply',
              reply_id: '9',
              user: { uid: 'u2' },
            })),
          }),
        };
      }
      return {
        status: 200,
        text: JSON.stringify({
          status_code: 0,
          cursor: 20,
          has_more: 0,
          comments: [
            {
              cid: '9',
              aweme_id: '1',
              text: 'hello',
              reply_comment_total: 3,
              user: { uid: 'u1' },
            },
          ],
        }),
      };
    },
    evidence: (entry) => evidence.push(entry),
    progress: () => {},
  });
  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.equal(result.datasets['tiktok.comments']?.length, 3);
  assert.deepEqual(evidence.find((entry) => entry.kind === 'reply-shortfall')?.shortfalls, [
    { parentId: '9', expected: 3, actual: 2 },
  ]);
});
