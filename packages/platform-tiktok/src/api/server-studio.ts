import type { Dataset, StudioInput } from '@datalom/platform-runtime/contracts/index';
import { redact } from '@datalom/platform-runtime/logging';
import { LabError, errorCode, type TransportResult } from '@datalom/platform-runtime/reverse-core';
import { pause } from '@datalom/platform-runtime/pause';
import {
  parseStudioAnalytics,
  parseStudioIdentity,
  parseStudioList,
  studioInsightEvidence,
  studioListEvidence,
  studioInsightPath,
  studioInsightTypes,
  studioListBody,
  studioListPath,
  studioUserPath,
} from './studio-parser.ts';

export type StudioRequest = {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
};

// Same dedicated account only. A hung proxy or TLS socket is not a reason to rotate.
export const studioTransportRetries = 2;
export function studioTransportRetry(code: string) {
  return /^(REQUEST_ABORTED|PROXY_(CONNECT|TUNNEL|REQUEST)_FAILED|TARGET_TLS_(FAILED|RESET)|SYSTEM_PROXY_CONNECT_FAILED)$/.test(
    code,
  );
}

function studioCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(
    /\b(STUDIO_[A-Z0-9_]+|LOGIN_REQUIRED|SITE_RATE_LIMITED|VIDEO_ID_MISSING)\b/,
  )?.[1];
  return code ?? errorCode(error);
}

export async function collectServerStudio(opts: {
  input: StudioInput;
  maxPages: number;
  signal: AbortSignal;
  request: (call: StudioRequest, signal: AbortSignal) => Promise<TransportResult>;
  evidence: (entry: Record<string, unknown>) => void;
  progress: (counts: Partial<Record<Dataset, number>>) => void;
  reconnect?: () => Promise<void>;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  const videos: Record<string, unknown>[] = [];
  const counts = () => ({ 'tiktok.videos': videos.length });
  const wait = opts.wait ?? pause;
  let requests = 0;
  const fetchOnce = async (call: StudioRequest) => {
    opts.signal.throwIfAborted();
    requests++;
    const entry: Record<string, unknown> = {
      kind: 'http-exchange',
      path: call.path.split('?')[0],
      method: call.method,
      request: requests,
      status: null,
      bytes: 0,
    };
    try {
      const response = await opts.request(call, opts.signal);
      entry.status = response.status;
      entry.bytes = Buffer.byteLength(response.text);
      entry.exchange = response.exchange;
      opts.signal.throwIfAborted();
      if (response.status === 429) throw new LabError('SITE_RATE_LIMITED');
      if (response.status === 401 || response.status === 403) throw new LabError('LOGIN_REQUIRED');
      if (response.status !== 200) throw new LabError('STUDIO_HTTP_ERROR');
      if (!response.text.trim()) throw new LabError('EMPTY_BODY');
      try {
        return JSON.parse(response.text) as unknown;
      } catch {
        throw new LabError('STUDIO_RESPONSE_NOT_JSON');
      }
    } catch (cause) {
      entry.error = studioCode(cause);
      throw cause instanceof LabError ? cause : new LabError(studioCode(cause));
    } finally {
      opts.evidence(entry);
    }
  };
  const fetchJson = async (call: StudioRequest) => {
    let attempt = 0;
    while (true) {
      try {
        return await fetchOnce(call);
      } catch (error) {
        const code = error instanceof LabError ? error.message : studioCode(error);
        if (!studioTransportRetry(code) || attempt >= studioTransportRetries) throw error;
        attempt++;
        opts.evidence({
          kind: 'studio-retry',
          error: code,
          attempt,
          path: call.path.split('?')[0],
          method: call.method,
        });
        await opts.reconnect?.();
        await wait(1000 * 2 ** (attempt - 1), opts.signal);
      }
    }
  };
  const identity = async () =>
    parseStudioIdentity(await fetchJson({ path: studioUserPath, method: 'GET' }));
  try {
    const owner = await identity();
    const seen = new Set<string>();
    let pagesUsed = 0;
    let truncated = false;
    for (const recentPosts of [true, false]) {
      let cursor = 0;
      let modeEnded = false;
      while (!modeEnded) {
        if (pagesUsed >= opts.maxPages) {
          truncated = true;
          break;
        }
        pagesUsed += 1;
        opts.signal.throwIfAborted();
        if ((await identity()).id !== owner.id) throw new LabError('STUDIO_ACCOUNT_CHANGED');
        const body = await fetchJson({
          path: studioListPath,
          method: 'POST',
          body: studioListBody(cursor, recentPosts),
        });
        opts.evidence({
          kind: 'studio-list',
          page: pagesUsed - 1,
          recentPosts,
          ...studioListEvidence(body),
        });
        let batch;
        try {
          batch = parseStudioList(body, new Date().toISOString());
        } catch (error) {
          throw new LabError(studioCode(error));
        }
        for (const video of batch.records) {
          const id = String(video.videoId);
          if (seen.has(id)) continue;
          const query = new URLSearchParams({
            type_requests: JSON.stringify(
              studioInsightTypes.map((insigh_type) => ({ insigh_type, aweme_id: id })),
            ),
          });
          const analysis = await fetchJson({
            path: `${studioInsightPath}?${query}`,
            method: 'GET',
          });
          opts.evidence({
            kind: 'studio-insight',
            videoId: id,
            ...studioInsightEvidence(analysis),
          });
          let metrics;
          try {
            metrics = parseStudioAnalytics(analysis, id, owner.id);
          } catch (error) {
            throw new LabError(studioCode(error));
          }
          videos.push({
            ...video,
            ...metrics,
            rank: videos.length + 1,
            authorId: owner.id,
            authorHandle: owner.handle,
            authorName: owner.name,
            url: `https://www.tiktok.com/@${owner.handle}/video/${id}`,
            source: 'tiktok-studio',
            raw: redact({ post: video.raw, analytics: analysis }),
          });
          seen.add(id);
          opts.progress(counts());
        }
        if (batch.ended) {
          if ((await identity()).id !== owner.id) throw new LabError('STUDIO_ACCOUNT_CHANGED');
          modeEnded = true;
          continue;
        }
        if (!batch.records.length || batch.cursor <= cursor)
          throw new LabError('STUDIO_PAGINATION_STALLED');
        cursor = batch.cursor;
      }
      if (truncated) break;
    }
    opts.progress(counts());
    return {
      complete: !truncated,
      error: truncated ? 'STUDIO_PAGE_LIMIT' : null,
      datasets: { 'tiktok.videos': videos },
      requests,
    };
  } catch (error) {
    opts.progress(counts());
    return {
      complete: false,
      error: studioCode(error),
      datasets: { 'tiktok.videos': videos },
      requests,
    };
  }
}
