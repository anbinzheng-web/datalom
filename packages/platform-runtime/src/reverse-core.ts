import { parseCommentPage } from '@datalom/platform-tiktok/api/comment-page';
import type { ApiExchange } from './api-diagnostics.ts';

export type Query = { videoId: string; cursor: string; parentId: string | null };
export type TransportResult = { status: number; text: string; exchange?: ApiExchange };
export type Transport = (query: Query, signal: AbortSignal) => Promise<TransportResult>;
export type Evidence = {
  query: Query;
  durationMs: number;
  status: number;
  bytes: number;
  businessStatus?: number;
  exchange?: ApiExchange;
  body?: unknown;
  error?: string;
};
export class LabError extends Error {}
export class NativeError extends Error {
  constructor(
    public code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NativeError';
  }
}
export type SdkAuxiliaryRequest = {
  id: number;
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: string | null;
};

export function errorCode(error: unknown): string {
  if (error instanceof NativeError && /^[A-Z_]+$/.test(error.code)) return error.code;
  return error instanceof LabError && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : error instanceof Error && /^(AbortError|TimeoutError)$/.test(error.name)
      ? 'REQUEST_ABORTED'
      : 'EXPERIMENT_FAILED';
}

// Project only replay-required fields. Never persist headers, full URLs or raw API objects.
export function replayBody(body: unknown): unknown {
  const scalar = (value: unknown) =>
    value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
  const root = body as Record<string, any>;
  const data = root.data && typeof root.data === 'object' ? root.data : root;
  return {
    status_code: root.status_code ?? root.statusCode,
    cursor: scalar(data.cursor),
    has_more: data.has_more ?? data.hasMore,
    comments: (data.comments ?? data.comment_list).map((row: Record<string, any>) => ({
      cid: scalar(row.cid ?? row.id ?? row.comment_id),
      aweme_id: scalar(row.aweme_id),
      reply_id: scalar(row.reply_id),
      text: scalar(row.text ?? row.content),
      digg_count: scalar(row.digg_count ?? row.diggCount),
      reply_comment_total: scalar(row.reply_comment_total ?? row.reply_count ?? row.replyCount),
      create_time: scalar(row.create_time ?? row.createTime),
      user: {
        uid: scalar(row.user?.uid),
        unique_id: scalar(row.user?.unique_id),
        nickname: scalar(row.user?.nickname),
      },
    })),
  };
}

export async function collectExperiment(opts: {
  videoId: string;
  transport: Transport;
  signal: AbortSignal;
  maxPages: number;
  maxComments: number;
  evidence: (entry: Evidence) => void;
  progress?: (value: { comments: number; requests: number }) => void;
}) {
  const started = performance.now();
  const records = new Map<string, Record<string, unknown>>();
  const parents = new Map<string, number>();
  const chainFailures: { parentId: string; error: string }[] = [];
  const shortfalls: { parentId: string; expected: number; actual: number }[] = [];
  const chains: { parentId: string | null; ended: boolean; count: number }[] = [];
  let requests = 0;
  let failure: string | undefined;
  try {
    const walk = async (parentId: string | null) => {
      const chain = { parentId, ended: false, count: 0 };
      chains.push(chain);
      const cursors = new Set<string>();
      const ids = new Set<string>();
      let cursor = '0';
      let stalled = 0;
      while (true) {
        opts.signal.throwIfAborted();
        if (requests >= opts.maxPages) throw new LabError('PAGE_LIMIT');
        if (cursors.has(cursor)) throw new LabError('PAGINATION_STALLED');
        cursors.add(cursor);
        const query = { videoId: opts.videoId, cursor, parentId };
        const entry: Evidence = { query, durationMs: 0, status: 0, bytes: 0 };
        const start = performance.now();
        requests++;
        let batch: ReturnType<typeof parseCommentPage>;
        try {
          const response = await opts.transport(query, opts.signal);
          opts.signal.throwIfAborted();
          entry.status = response.status;
          entry.exchange = response.exchange;
          entry.bytes = Buffer.byteLength(response.text);
          if (response.status === 429) throw new LabError('RATE_LIMITED');
          if (response.status === 401) throw new LabError('LOGIN_REQUIRED');
          if (response.status === 403) throw new LabError('FORBIDDEN');
          if (response.status !== 200) throw new LabError('HTTP_ERROR');
          if (!response.text.trim()) throw new LabError('EMPTY_BODY');
          let body: unknown;
          try {
            body = JSON.parse(response.text);
          } catch {
            throw new LabError('NOT_JSON');
          }
          const code = (body as Record<string, unknown>)?.status_code;
          if (typeof code === 'number') entry.businessStatus = code;
          try {
            batch = parseCommentPage(body, opts.videoId, parentId);
          } catch (error) {
            const code = error instanceof Error ? error.message : '';
            throw new LabError(/^COMMENT_[A-Z_]+$/.test(code) ? code : 'INVALID_COMMENT_PAGE');
          }
          entry.body = replayBody(body);
        } catch (error) {
          entry.error = errorCode(error);
          throw error;
        } finally {
          entry.durationMs = Math.round(performance.now() - start);
          opts.evidence(entry);
        }
        const before = ids.size;
        for (const row of batch.records) {
          const id = String(row.commentId);
          if (ids.has(id)) continue;
          ids.add(id);
          if (records.has(id)) throw new LabError('COMMENT_PARENT_CONFLICT');
          if (records.size >= opts.maxComments) throw new LabError('COMMENT_LIMIT');
          // Do not retain API objects, profile signatures or potentially signed media URLs.
          const fields = Object.fromEntries(
            [
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
            ].map((key) => [key, row[key]]),
          );
          records.set(id, fields);
          chain.count++;
          if (parentId === null) {
            if (!Number.isSafeInteger(row.replyCount) || Number(row.replyCount) < 0)
              throw new LabError('REPLY_COUNT_MISSING');
            if (Number(row.replyCount) > 0) parents.set(id, Number(row.replyCount));
          }
        }
        opts.progress?.({ comments: records.size, requests });
        chain.ended = batch.ended;
        if (batch.ended) break;
        if (records.size >= opts.maxComments) throw new LabError('COMMENT_LIMIT');
        stalled = ids.size === before ? stalled + 1 : 0;
        if (stalled >= 2) throw new LabError('PAGINATION_STALLED');
        cursor = batch.cursor;
      }
      if (parentId !== null && chain.count < (parents.get(parentId) ?? 0))
        shortfalls.push({ parentId, expected: parents.get(parentId)!, actual: chain.count });
    };
    await walk(null);
    for (const parent of parents.keys()) {
      try {
        await walk(parent);
      } catch (error) {
        if (errorCode(error) !== 'PAGINATION_STALLED') throw error;
        chainFailures.push({ parentId: parent, error: 'PAGINATION_STALLED' });
      }
    }
    if (chainFailures.length) throw new LabError('PAGINATION_STALLED');
    if (shortfalls.length) throw new LabError('REPLY_COUNT_SHORTFALL');
  } catch (error) {
    failure = errorCode(error);
  }
  return {
    schemaVersion: 1,
    experiment: 'tiktok.video-comments.reverse',
    videoId: opts.videoId,
    status: failure ? (/_LIMIT$/.test(failure) ? 'limited' : 'failed') : 'complete',
    complete: !failure,
    error: failure ?? null,
    durationMs: Math.round(performance.now() - started),
    requests,
    comments: records.size,
    mainComments: chains.find((chain) => chain.parentId === null)?.count ?? 0,
    replies: chains.filter((chain) => chain.parentId !== null).reduce((n, c) => n + c.count, 0),
    chains,
    shortfalls,
    chainFailures,
    records: [...records.values()],
  };
}
