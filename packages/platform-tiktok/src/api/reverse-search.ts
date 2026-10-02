import type { TransportResult } from '@datalom/platform-runtime/reverse-core';
import type { Page } from 'playwright-core';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { normalized, parseTikTok } from '@datalom/platform-runtime/tiktok-parser';
import { withTimeout } from '@datalom/platform-runtime/pause';

export const SEARCH_PATH = '/api/search/general/full/';
const signatures = /^(X-Bogus|X-Gnarly|X-Dynosaur|_signature)$/i;
export function searchTemplate(value: string, keyword: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new LabError('INVALID_SEARCH_TEMPLATE');
  }
  if (
    u.origin !== 'https://www.tiktok.com' ||
    u.pathname !== SEARCH_PATH ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new LabError('INVALID_SEARCH_TEMPLATE');
  if (
    u.searchParams.getAll('keyword').length !== 1 ||
    normalized(u.searchParams.get('keyword') ?? '') !== normalized(keyword)
  )
    throw new LabError('SEARCH_KEYWORD_MISMATCH');
  return u;
}

export function searchRequestUrl(
  template: string,
  keyword: string,
  cursor: string,
  searchId?: string,
) {
  const u = searchTemplate(template, keyword);
  if (!/^\d+$/.test(cursor)) throw new LabError('SEARCH_PAGINATION_INVALID');
  // A signature belongs to its exact query. Altered queries need a new signer; never pretend reuse works.
  for (const key of [...u.searchParams.keys()])
    if (signatures.test(key)) u.searchParams.delete(key);
  u.searchParams.set('cursor', cursor);
  if (searchId) u.searchParams.set('search_id', searchId);
  return u.toString();
}

export function describeSearchTemplate(template: string, keyword: string) {
  const u = searchTemplate(template, keyword);
  const safe = new Set([
    'keyword',
    'cursor',
    'count',
    'offset',
    'search_source',
    'from_page',
    'aid',
    'app_name',
    'device_platform',
    'browser_language',
    'region',
  ]);
  return {
    method: 'GET',
    origin: u.origin,
    path: u.pathname,
    parameters: [...u.searchParams].map(([name, value]) => ({
      name,
      ...(safe.has(name) ? { value } : { value: '[REDACTED]', length: value.length }),
    })),
    signatures: [...u.searchParams.keys()].filter((key) => signatures.test(key)),
    tokenPresent: u.searchParams.has('msToken'),
  };
}

const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
export function parseSearchPage(body: unknown) {
  const root = obj(body);
  if (![0, '0'].includes(root.status_code ?? root.statusCode))
    throw new LabError('SEARCH_API_REJECTED');
  if (!Array.isArray(root.data)) throw new LabError('SEARCH_RESPONSE_INVALID');
  const more = root.has_more ?? root.hasMore;
  if (![true, false, 0, 1].includes(more)) throw new LabError('SEARCH_PAGINATION_INVALID');
  const cursor = String(root.cursor ?? '');
  if ((more === true || more === 1) && !/^\d+$/.test(cursor))
    throw new LabError('SEARCH_PAGINATION_INVALID');
  // User cards are valid Top results. Malformed video cards must not silently become empty success.
  for (const row of root.data)
    if (obj(row).type === 1 && !/^\d+$/.test(String(obj(obj(row).item).id ?? '')))
      throw new LabError('SEARCH_VIDEO_INVALID');
  const parsed = parseTikTok(root, new Date().toISOString());
  if (root.data.some((row: unknown) => obj(row).type === 1) && !parsed)
    throw new LabError('SEARCH_RESPONSE_INVALID');
  const records = (parsed?.records ?? []).map((row) =>
    Object.fromEntries(
      [
        'videoId',
        'url',
        'description',
        'authorHandle',
        'authorName',
        'createdAt',
        'likes',
        'commentsCount',
        'favorites',
        'shares',
        'plays',
        'tags',
        'observedAt',
      ].map((key) => [key, row[key]]),
    ),
  );
  const searchId = obj(root.log_pb).impr_id;
  return {
    records,
    cursor,
    ended: more === false || more === 0,
    searchId:
      typeof searchId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(searchId)
        ? searchId
        : undefined,
    cardTypes: root.data.map((row: unknown) =>
      typeof obj(row).type === 'number' ? obj(row).type : null,
    ),
  };
}

// Passive inspection only: performance entries are existing browser evidence, not fresh requests.
export async function captureSearchTemplate(
  pages: Page[],
  keyword: string,
  signal?: AbortSignal,
  waiting?: () => void,
) {
  const candidates = pages.filter((p) => {
    try {
      const u = new URL(p.url());
      return (
        u.origin === 'https://www.tiktok.com' &&
        u.pathname === '/search' &&
        normalized(u.searchParams.get('q') ?? '') === normalized(keyword)
      );
    } catch {
      return false;
    }
  });
  if (!candidates.length) throw new LabError('SEARCH_PAGE_NOT_OPEN');
  if (candidates.length > 1) throw new LabError('SEARCH_PAGE_AMBIGUOUS');
  const page = candidates[0];
  let resolveObserved!: (value: string) => void;
  const observedRequest = new Promise<string>((resolve) => {
    resolveObserved = resolve;
  });
  const listener = (request: import('playwright-core').Request) => {
    if (request.method() !== 'GET') return;
    try {
      searchTemplate(request.url(), keyword);
      resolveObserved(request.url());
    } catch {
      /* Different endpoint or keyword. */
    }
  };
  page.on('request', listener);
  try {
    const captured = await withTimeout(
      page.evaluate(() => ({
        requests: performance
          .getEntriesByType('resource')
          .map((e) => ({ name: e.name, startTime: e.startTime }))
          .filter((e) => {
            try {
              const u = new URL(e.name);
              return u.origin === 'https://www.tiktok.com' && u.pathname.startsWith('/api/search/');
            } catch {
              return false;
            }
          })
          .slice(-100),
        videoCards: document.querySelectorAll('[data-e2e="search_top-item"]').length,
      })),
      10000,
      'SEARCH_CAPTURE_TIMEOUT',
    );
    if (
      new URL(page.url()).origin !== 'https://www.tiktok.com' ||
      new URL(page.url()).pathname !== '/search' ||
      normalized(new URL(page.url()).searchParams.get('q') ?? '') !== normalized(keyword)
    )
      throw new LabError('SEARCH_PAGE_CHANGED');
    const templates = captured.requests
      .filter((entry) => {
        try {
          searchTemplate(entry.name, keyword);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.startTime - b.startTime);
    if (!templates.length) {
      waiting?.();
      let stop!: () => void;
      const cancelled = new Promise<never>((_, reject) => {
        stop = () => reject(new LabError('REQUEST_ABORTED'));
        signal?.addEventListener('abort', stop, { once: true });
        if (signal?.aborted) stop();
      });
      try {
        const template = await withTimeout(
          Promise.race([observedRequest, cancelled]),
          90000,
          'SEARCH_REQUEST_NOT_OBSERVED',
        );
        return {
          template,
          observed: 1,
          videoCards: captured.videoCards,
          searchPaths: [SEARCH_PATH],
          source: 'passive-request-event',
        };
      } finally {
        signal?.removeEventListener('abort', stop);
      }
    }
    // Prefer cursor 0 when retained, otherwise explicitly report the captured cursor.
    const selected =
      templates.find((e) => ['0', null].includes(new URL(e.name).searchParams.get('cursor'))) ??
      templates[0];
    return {
      template: selected.name,
      observed: templates.length,
      videoCards: captured.videoCards,
      searchPaths: [...new Set(captured.requests.map((e) => new URL(e.name).pathname))],
      source: 'existing-performance-resource-entries',
    };
  } finally {
    page.off('request', listener);
  }
}

export async function collectSearch(opts: {
  template: string;
  keyword: string;
  maxPages: number;
  maxVideos: number;
  signal: AbortSignal;
  fetch: (url: string, signal: AbortSignal) => Promise<TransportResult>;
  evidence: (entry: unknown) => void;
}) {
  const first = searchTemplate(opts.template, opts.keyword);
  const startsAtZero = ['0', null].includes(first.searchParams.get('cursor'));
  let url = opts.template,
    requests = 0;
  const visited = new Set<string>(),
    records = new Map<string, Record<string, unknown>>();
  let error: string | null = null,
    exhausted = false;
  for (let i = 0; i < opts.maxPages; i++) {
    const cursor = new URL(url).searchParams.get('cursor') ?? '0';
    const evidence: Record<string, unknown> = {
      request: i + 1,
      cursor,
      path: SEARCH_PATH,
      signing: i === 0 ? 'provided-template-replay' : 'unsigned-mutated-query',
      status: null,
      bytes: 0,
    };
    try {
      opts.signal.throwIfAborted();
      visited.add(cursor);
      requests++;
      const response = await opts.fetch(url, opts.signal);
      evidence.status = response.status;
      evidence.exchange = response.exchange;
      evidence.bytes = Buffer.byteLength(response.text);
      if (response.status !== 200)
        throw new LabError(response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR');
      if (!response.text.trim()) throw new LabError('EMPTY_BODY');
      let body;
      try {
        body = JSON.parse(response.text);
      } catch {
        throw new LabError('NOT_JSON');
      }
      evidence.businessStatus =
        typeof body?.status_code === 'number' ? body.status_code : undefined;
      evidence.rootFields = Object.keys(obj(body));
      const parsed = parseSearchPage(body);
      evidence.cardTypes = parsed.cardTypes;
      evidence.nextCursor = parsed.cursor;
      evidence.hasMore = !parsed.ended;
      evidence.searchIdPresent = !!parsed.searchId;
      evidence.videos = parsed.records.length;
      for (const row of parsed.records) {
        if (records.size >= opts.maxVideos && !records.has(String(row.videoId)))
          throw new LabError('VIDEO_LIMIT');
        records.set(String(row.videoId), row);
      }
      if (parsed.ended) {
        exhausted = true;
        break;
      }
      if (visited.has(parsed.cursor)) throw new LabError('PAGINATION_STALLED');
      if (records.size >= opts.maxVideos) throw new LabError('VIDEO_LIMIT');
      url = searchRequestUrl(url, opts.keyword, parsed.cursor, parsed.searchId);
      if (i + 1 === opts.maxPages) throw new LabError('PAGE_LIMIT');
    } catch (e) {
      error = errorCode(e);
      evidence.error = error;
      break;
    } finally {
      opts.evidence(evidence);
    }
  }
  return {
    status: error ? 'failed' : exhausted && startsAtZero ? 'complete' : 'partial',
    error,
    requests,
    videos: records.size,
    records: [...records.values()],
    complete: exhausted && startsAtZero && !error,
    exhausted,
    startsAtZero,
    scope: 'videos-returned-by-top-search-api',
    allPlatformMatchesVerified: false,
  };
}
