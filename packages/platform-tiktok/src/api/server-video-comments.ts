import type { Dataset, VideoCommentsInput } from '@datalom/platform-runtime/contracts/index';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';
import { collectExperiment, LabError, type TransportResult } from '@datalom/platform-runtime/reverse-core';
import { requestUrl } from '@datalom/platform-runtime/reverse-transports';
import { keywordCommentTemplate } from './keyword-api.ts';

const commentFields = [
  'commentId',
  'videoId',
  'parentCommentId',
  'text',
  'contentType',
  'likes',
  'replyCount',
  'createdAt',
  'userKey',
  'userId',
  'handle',
  'nickname',
  'commentLanguage',
  'region',
  'accountRegion',
  'observedAt',
] as const;

const userFields = [
  'userKey',
  'userId',
  'handle',
  'nickname',
  'region',
  'accountRegion',
  'commentLanguage',
  'commentCount',
] as const;

export function videoCommentsBootstrapKeyword(videoUrl: string) {
  try {
    return decodeURIComponent(
      new URL(videoUrl).pathname.split('/')[1]?.replace(/^@/, '') || 'video',
    );
  } catch {
    return 'video';
  }
}

export function videoIdFromUrl(videoUrl: string) {
  return /\/(?:video|photo)\/(\d+)/.exec(videoUrl)?.[1] ?? null;
}

export async function collectServerVideoComments(opts: {
  input: VideoCommentsInput;
  template: string;
  bootstrapKeyword: string;
  maxPages: number;
  signal: AbortSignal;
  fetch: (url: string, signal: AbortSignal) => Promise<TransportResult>;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
}) {
  const videoId = videoIdFromUrl(opts.input.videoUrl);
  if (!videoId) throw new LabError('INVALID_VIDEO_URL');
  let templateKeyword = opts.bootstrapKeyword;
  try {
    templateKeyword = new URL(opts.template).searchParams.get('keyword') || opts.bootstrapKeyword;
  } catch {
    throw new LabError('INVALID_SEARCH_TEMPLATE');
  }
  const mainUrl = keywordCommentTemplate(opts.template, templateKeyword);
  let requests = 0;
  const experiment = await collectExperiment({
    videoId,
    maxPages: opts.maxPages,
    maxComments: opts.input.maxComments,
    signal: opts.signal,
    transport: async (query, signal) => {
      opts.signal.throwIfAborted();
      if (requests >= opts.maxPages) throw new LabError('PAGE_LIMIT');
      requests++;
      return opts.fetch(requestUrl(query, { mainUrl }), signal);
    },
    evidence: (entry) =>
      opts.evidence({
        kind: 'http-exchange',
        path: entry.query.parentId ? '/api/comment/list/reply/' : '/api/comment/list/',
        cursor: entry.query.cursor,
        videoId: entry.query.videoId,
        parentId: entry.query.parentId,
        request: requests,
        status: entry.status,
        bytes: entry.bytes,
        error: entry.error,
      }),
    progress: ({ comments }) => opts.progress({ 'tiktok.comments': comments }),
  });
  const comments = experiment.records as DataRow[];
  const users = aggregate([], comments).users.map((row) =>
    Object.fromEntries(userFields.map((key) => [key, row[key]])),
  );
  const projected = comments.map((row) =>
    Object.fromEntries(commentFields.map((key) => [key, row[key]])),
  );
  const limited =
    experiment.error === 'COMMENT_LIMIT' ||
    experiment.error === 'PAGE_LIMIT' ||
    experiment.error === 'REPLY_COUNT_SHORTFALL';
  if (experiment.shortfalls.length)
    opts.evidence({ kind: 'reply-shortfall', shortfalls: experiment.shortfalls });
  opts.progress({ 'tiktok.comments': projected.length, 'tiktok.users': users.length });
  return {
    complete: experiment.complete || limited,
    error: limited ? null : experiment.error,
    requests,
    datasets: {
      'tiktok.comments': projected,
      'tiktok.users': users,
    } as Partial<Record<Dataset, Record<string, unknown>[]>>,
  };
}
