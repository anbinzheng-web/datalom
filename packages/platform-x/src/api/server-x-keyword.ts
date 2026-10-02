import { checkKeywordRelevance, type KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Dataset, KeywordInput, PoolCredential } from '@datalom/platform-runtime/contracts/index';
import { createHash } from 'node:crypto';
import { openChromeTransport } from '@datalom/platform-runtime/impit-api';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { XTransport } from './x-transport.ts';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';
import type { XOperation, parseTimeline } from './x-native.ts';
import { pause } from '@datalom/platform-runtime/pause';

export type XPage = ReturnType<typeof parseTimeline>;
export type XKeywordOptions = {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  signal: AbortSignal;
  maxPages: number;
  evidence: (e: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
  beforeRequest?: () => void;
};
const hashCursor = (cursor?: string) =>
  cursor ? createHash('sha256').update(cursor).digest('hex') : null;
const number = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
function postRow(item: any, observedAt: string): DataRow {
  return {
    tweetId: item.id,
    videoId: item.id,
    url: `https://x.com/${item.author.username}/status/${item.id}`,
    text: item.text,
    description: item.text,
    authorId: item.author.id,
    authorHandle: item.author.username,
    authorName: item.author.name ?? null,
    createdAt: item.createdAt ?? null,
    likes: number(item.counts.likes),
    commentsCount: number(item.counts.replies),
    shares: number(item.counts.reposts),
    plays: number(item.counts.views),
    tags: item.hashtags ?? [],
    observedAt,
  };
}
function commentRow(item: any, postId: string, observedAt: string): DataRow {
  return {
    commentId: item.id,
    tweetId: item.id,
    videoId: postId,
    postId,
    parentCommentId: null,
    replyToPostId: item.replyToPostId,
    text: item.text,
    url: `https://x.com/${item.author.username}/status/${item.id}`,
    userKey: `uid:${item.author.id}`,
    userId: item.author.id,
    handle: item.author.username,
    nickname: item.author.name ?? null,
    authorId: item.author.id,
    authorHandle: item.author.username,
    authorName: item.author.name ?? null,
    createdAt: item.createdAt ?? null,
    likes: number(item.counts.likes),
    replyCount: number(item.counts.replies),
    commentLanguage: item.language ?? null,
    observedAt,
  };
}
// Shared by the server and bounded live probes. No browser dependency or raw responses in results.
export async function collectXKeyword(
  opts: XKeywordOptions & {
    request: (operation: XOperation, variables: Record<string, unknown>) => Promise<XPage>;
  },
) {
  const posts: DataRow[] = [],
    comments: DataRow[] = [];
  const datasets: Partial<Record<Dataset, DataRow[]>> = {
    'x.posts': posts,
    'x.comments': comments,
  };
  const counts = () => Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, v.length]));
  let error: string | null = null,
    requests = 0;
  const request = async (operation: XOperation, variables: Record<string, unknown>) => {
    opts.signal.throwIfAborted();
    if (requests >= opts.maxPages) throw new LabError('PAGE_LIMIT');
    if (requests) await pause(300, opts.signal);
    requests++;
    return opts.request(operation, variables);
  };
  try {
    let cursor: string | undefined;
    const seen = new Set<string>(),
      cursors = new Set<string>();
    let stalled = 0;
    for (;;) {
      const page = await request('search.timeline', {
        rawQuery: opts.input.keyword,
        ...(cursor ? { cursor } : {}),
      });
      let added = 0;
      for (const item of page.items) {
        if (item.kind !== 'tweet' || seen.has(item.id)) continue;
        seen.add(item.id);
        const row = postRow(item, new Date().toISOString());
        if (opts.input.minLikes !== null && row.likes === null)
          throw new LabError('X_LIKES_MISSING');
        row.qualifies = opts.input.minLikes === null || Number(row.likes) > opts.input.minLikes;
        row.rank = posts.length + 1;
        posts.push(row);
        added++;
        if (posts.length >= opts.input.videoLimit) break;
      }
      const stop =
        posts.length >= opts.input.videoLimit ? 'limit' : !page.hasMore ? 'exhausted' : null;
      opts.evidence({
        kind: 'x-pagination',
        operation: 'search',
        request: requests,
        cursorHash: hashCursor(cursor),
        nextCursorHash: hashCursor(page.cursor),
        returned: page.items.length,
        added,
        total: posts.length,
        stop,
        skipped: page.skipped,
      });
      opts.progress(counts());
      if (stop) break;
      stalled = added ? 0 : stalled + 1;
      if (!page.cursor || page.cursor === cursor || cursors.has(page.cursor) || stalled >= 2)
        throw new LabError('PAGINATION_STALLED');
      cursors.add(page.cursor);
      cursor = page.cursor;
    }
    for (const post of posts.filter((p) => p.qualifies === true)) {
      if (opts.input.commentsPerVideo === 0 || comments.length >= opts.input.totalComments) break;
      if (post.commentsCount === 0) continue;
      if (!(await checkKeywordRelevance(post, opts.signal, opts.relevance, opts.evidence)))
        continue;
      let cursor: string | undefined,
        stalled = 0,
        collected = 0;
      const seen = new Set<string>(),
        cursors = new Set<string>();
      for (;;) {
        const page = await request('post.conversation', {
          focalTweetId: post.tweetId,
          ...(cursor ? { cursor } : {}),
        });
        let added = 0;
        for (const item of page.items) {
          // Conversation modules include ancestors, nested replies and recommendations.
          // This collector's declared scope is direct replies to the focal post only.
          if (item.kind !== 'tweet' || item.replyToPostId !== post.tweetId || seen.has(item.id))
            continue;
          seen.add(item.id);
          comments.push(commentRow(item, String(post.tweetId), new Date().toISOString()));
          added++;
          collected++;
          if (
            collected >= opts.input.commentsPerVideo ||
            comments.length >= opts.input.totalComments
          )
            break;
        }
        const stop =
          collected >= opts.input.commentsPerVideo || comments.length >= opts.input.totalComments
            ? 'limit'
            : !page.hasMore
              ? 'exhausted'
              : null;
        opts.evidence({
          kind: 'x-pagination',
          operation: 'comments',
          postId: post.tweetId,
          request: requests,
          cursorHash: hashCursor(cursor),
          nextCursorHash: hashCursor(page.cursor),
          returned: page.items.length,
          added,
          total: collected,
          stop,
          nestedReplyCursors: page.moduleCursors.length,
          skipped: page.skipped,
        });
        opts.progress(counts());
        if (stop) break;
        stalled = added ? 0 : stalled + 1;
        if (!page.cursor || page.cursor === cursor || cursors.has(page.cursor) || stalled >= 2)
          throw new LabError('PAGINATION_STALLED');
        cursors.add(page.cursor);
        cursor = page.cursor;
      }
    }
  } catch (cause) {
    error = errorCode(cause);
  }
  const derived = aggregate(posts, comments);
  datasets['x.users'] = derived.users;
  datasets['x.tags'] = derived.tags;
  datasets['x.keyword-evidence'] = derived.keywords;
  opts.progress(counts());
  return {
    complete: !error,
    error,
    requests,
    datasets,
    scope: 'configured-keyword-budget-direct-replies',
    allPlatformMatchesVerified: false,
  };
}
export async function collectServerXKeyword(
  opts: XKeywordOptions & { credential: PoolCredential },
) {
  if (!opts.credential.proxy) throw new LabError('PROXY_REQUIRED');
  const upstream = await accountUpstream(new URL(opts.credential.proxy.url));
  const chrome = await openChromeTransport(opts.credential.proxy, opts.signal, upstream, 60_000);
  try {
    const transport = new XTransport(
      chrome.client,
      opts.credential,
      opts.signal,
      opts.evidence,
      opts.beforeRequest,
    );
    return await collectXKeyword({
      ...opts,
      request: (operation, variables) => transport.request(operation, variables),
    });
  } finally {
    await chrome.close();
  }
}
