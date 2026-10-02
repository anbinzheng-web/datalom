import type { KeywordRelevance } from '@datalom/platform-runtime/keyword-relevance';
import type { Dataset, KeywordInput } from '@datalom/platform-runtime/contracts/index';
import { collectKeywordApi } from './keyword-api.ts';
import { aggregate, type DataRow } from '@datalom/platform-runtime/tiktok-parser';
import { LabError, errorCode, type TransportResult } from '@datalom/platform-runtime/reverse-core';

export const SERVER_KEYWORD_VERSION = 'server-api-1.2.11';

// Keep the browser collector's business rules, but supply only the server HTTP transport.
// Persist projected business fields, never raw API objects or signed media URLs.
const fields: Partial<Record<Dataset, string[]>> = {
  'tiktok.videos': [
    'videoId',
    'url',
    'contentType',
    'description',
    'authorId',
    'authorHandle',
    'authorName',
    'createdAt',
    'likes',
    'commentsCount',
    'favorites',
    'shares',
    'plays',
    'tags',
    'rank',
    'qualifies',
    'keywordRelevance',
    'observedAt',
  ],
  'tiktok.comments': [
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
  ],
};

export async function collectServerKeyword(opts: {
  relevance?: KeywordRelevance;
  input: KeywordInput;
  template?: string;
  maxPages: number;
  signal: AbortSignal;
  fetch: (
    url: string,
    signal: AbortSignal,
  ) => Promise<TransportResult & { paginationRestart?: boolean }>;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
}) {
  const datasets: Partial<Record<Dataset, DataRow[]>> = {
    'tiktok.videos': [],
    'tiktok.comments': [],
  };
  const counts = () =>
    Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length]));
  let requests = 0;
  let epoch = 0;
  let error: string | null = null;
  const fetchJson = async (url: string) => {
    opts.signal.throwIfAborted();
    if (requests >= opts.maxPages) throw new LabError('PAGE_LIMIT');
    requests++;
    const target = new URL(url);
    const entry: Record<string, unknown> = {
      kind: 'http-exchange',
      path: target.pathname,
      cursor: target.searchParams.get('cursor'),
      videoId: target.searchParams.get('aweme_id'),
      request: requests,
      status: null,
      bytes: 0,
    };
    try {
      const response = await opts.fetch(url, opts.signal);
      if (response.paginationRestart) {
        epoch++;
        entry.cursor = '0';
        entry.paginationRestart = true;
      }
      entry.status = response.status;
      entry.bytes = Buffer.byteLength(response.text);
      entry.exchange = response.exchange;
      opts.signal.throwIfAborted();
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
      const root =
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
      entry.businessStatus = root.status_code ?? root.statusCode ?? null;
      const message = root.status_msg ?? root.statusMsg;
      if (typeof message === 'string' && message.trim())
        entry.statusMsg = message.trim().slice(0, 200);
      entry.rootFields = Object.keys(root).slice(0, 24);
      return body;
    } catch (cause) {
      entry.error = errorCode(cause);
      throw cause;
    } finally {
      opts.evidence(entry);
    }
  };
  try {
    if (!opts.template) throw new LabError('SEARCH_CONTEXT_REQUIRED');
    const template = new URL(opts.template);
    if (
      template.origin !== 'https://www.tiktok.com' ||
      template.pathname !== '/api/search/general/full/' ||
      template.username ||
      template.password ||
      template.hash
    )
      throw new LabError('INVALID_SEARCH_TEMPLATE');
    template.searchParams.set('keyword', opts.input.keyword);
    template.searchParams.set('cursor', '0');
    template.searchParams.delete('search_id');
    if (template.searchParams.has('offset')) template.searchParams.set('offset', '0');
    await collectKeywordApi({
      input: opts.input,
      signal: opts.signal,
      relevance: opts.relevance
        ? async (row, signal) => {
            const saved = datasets['tiktok.videos']!.find((v) => v.videoId === row.videoId);
            try {
              const result = await opts.relevance!(row, signal);
              if (saved) saved.keywordRelevance = result;
              return result;
            } catch (error) {
              if (saved) saved.keywordRelevance = 'failed';
              throw error;
            }
          }
        : undefined,
      session: {
        epoch: () => epoch,
        template: template.toString(),
        first: await fetchJson(template.toString()),
        fetch: fetchJson,
      },
      emit: (dataset, rows) => {
        const allowed = fields[dataset];
        if (!allowed) return;
        datasets[dataset]!.push(
          ...rows.map((row) => Object.fromEntries(allowed.map((key) => [key, row[key]]))),
        );
        opts.progress(counts());
      },
      evidence: opts.evidence,
      failure: (videoId, reason) => opts.evidence({ stage: 'comment-failure', videoId, reason }),
    });
  } catch (cause) {
    error =
      cause instanceof Error && /^[A-Z_]+(?::|$)/.test(cause.message)
        ? cause.message.split(':')[0]
        : errorCode(cause);
  }
  // Keep collected data and derived datasets even when a later page fails or is cancelled.
  const derived = aggregate(datasets['tiktok.videos']!, datasets['tiktok.comments']!);
  datasets['tiktok.users'] = derived.users;
  datasets['tiktok.tags'] = derived.tags;
  datasets['tiktok.keyword-evidence'] = derived.keywords;
  opts.progress(counts());
  return {
    complete: !error,
    error,
    requests,
    datasets,
    scope: 'configured-keyword-budget-main-comments',
    allPlatformMatchesVerified: false,
  };
}
