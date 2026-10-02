import { LabError, errorCode, type TransportResult } from '@datalom/platform-runtime/reverse-core';
import type { KeywordSession } from './server-keyword-session.ts';
import { keywordCommentReplyUrl, keywordCommentUrl, keywordSearchUrl } from './keyword-api.ts';
import { pause } from '@datalom/platform-runtime/pause';

// Bounds apply to the whole task, not an unbounded loop around every failed page.
export const keywordRecoveryPolicy = { accounts: 3, retries: 2, recoveries: 8 } as const;
export function keywordRecoveryAction(code: string): 'retry' | 'switch' | 'stop' {
  if (
    /^(REQUEST_ABORTED|PROXY_(CONNECT|TUNNEL|REQUEST)_FAILED|TARGET_TLS_(FAILED|RESET)|SYSTEM_PROXY_CONNECT_FAILED|EMPTY_BODY|NOT_JSON|HTTP_ERROR|ACCOUNT_(HTTP_REJECTED|EMPTY_BODY|NOT_JSON|REQUEST_FAILED)|SEARCH_BOOTSTRAP_(HTTP_FAILED|EMPTY))$/.test(
      code,
    )
  )
    return 'retry';
  if (
    /^(LOGIN_REQUIRED|FORBIDDEN|RATE_LIMITED|SITE_RATE_LIMITED|COOKIE_ACCOUNT_BUSY|ACCOUNT_(API_REJECTED|IDENTITY_MISSING)|COOKIE_ACCOUNT_(CHANGED|EXPIRED|DISABLED|NOT_FOUND)|COOKIE_POOL_LOGIN_REQUIRED|PROXY_(REQUIRED|AUTH_FAILED)|BROWSER_.*|SEARCH_BOOTSTRAP_(MISSING|INVALID)|SEARCH_CONTEXT_REQUIRED|JS_STATE_REQUIRED)$/.test(
      code,
    )
  )
    return 'switch';
  return 'stop';
}
function responseError(response: TransportResult) {
  if (response.status === 429) return 'RATE_LIMITED';
  if (response.status === 401) return 'LOGIN_REQUIRED';
  if (response.status === 403) return 'FORBIDDEN';
  if (response.status >= 500 || response.status === 408) return 'HTTP_ERROR';
  if (response.status !== 200) return null;
  if (!response.text.trim()) return 'EMPTY_BODY';
  try {
    JSON.parse(response.text);
  } catch {
    return 'NOT_JSON';
  }
  return null;
}

export async function createRecoveringKeywordSession(opts: {
  keyword: string;
  signal: AbortSignal;
  maxRequests: number;
  deadline?: number;
  candidates: () => string[];
  open: (accountId: string) => Promise<KeywordSession>;
  evidence: (entry: Record<string, unknown>) => void;
  wait?: typeof pause;
}): Promise<KeywordSession> {
  const visited = new Set<string>();
  let accountId: string | undefined, session: KeywordSession | undefined;
  let retries = 0,
    recoveries = 0,
    requests = 0;
  const wait = opts.wait ?? pause;
  const close = async () => {
    const old = session;
    session = undefined;
    await old?.close();
  };
  const select = () => {
    if (visited.size >= keywordRecoveryPolicy.accounts) return false;
    const next = opts.candidates().find((id) => !visited.has(id));
    if (!next) return false;
    accountId = next;
    visited.add(next);
    retries = 0;
    return true;
  };
  const recover = async (error: unknown, page?: URL) => {
    opts.signal.throwIfAborted();
    const code = errorCode(error),
      action = keywordRecoveryAction(code);
    const source = accountId;
    const phase = session ? 'api-request' : 'session-open';
    // Opening a session already includes a bounded login/bootstrap request.
    // Failed setup must not consume three probes before trying another account.
    const retry = !!session && action === 'retry' && retries < keywordRecoveryPolicy.retries;
    if (action === 'stop' || recoveries >= keywordRecoveryPolicy.recoveries) {
      opts.evidence({
        kind: 'cookie-recovery-exhausted',
        accountId: source,
        error: code,
        recoveries,
        phase,
        reason: action === 'stop' ? 'not-recoverable' : 'recovery-budget',
      });
      throw error;
    }
    const delayMs = retry ? 1000 * 2 ** retries : 500;
    if (opts.deadline !== undefined && opts.deadline - Date.now() <= delayMs + 1000) {
      opts.evidence({
        kind: 'cookie-recovery-exhausted',
        accountId: source,
        error: code,
        recoveries,
        phase,
        reason: 'time-budget',
      });
      throw error;
    }
    if (!retry) await close();
    else if (/^(REQUEST_ABORTED|PROXY_|TARGET_TLS_|SYSTEM_PROXY_)/.test(code)) {
      // Fetch cancellation may leave an in-flight proxy/TLS connection pending.
      // Discard that transport without discarding the SDK's response-token state.
      await session?.reconnect?.();
    }
    if (!retry && !select()) {
      opts.evidence({
        kind: 'cookie-recovery-exhausted',
        accountId: source,
        error: code,
        recoveries,
        phase,
        reason: 'no-unused-candidate',
      });
      throw error;
    }
    recoveries++;
    if (retry) retries++;
    opts.evidence({
      kind: retry ? 'cookie-retry' : 'cookie-failover',
      accountId: source,
      nextAccountId: accountId,
      error: code,
      attempt: retries,
      recoveries,
      phase,
      delayMs,
      path: page?.pathname,
      cursor: page?.searchParams.get('cursor'),
      videoId: page?.searchParams.get('aweme_id'),
    });
    await wait(delayMs, opts.signal);
  };
  if (!select()) throw new LabError('COOKIE_POOL_LOGIN_REQUIRED');
  try {
    while (!session) {
      opts.signal.throwIfAborted();
      try {
        session = await opts.open(accountId!);
      } catch (error) {
        await recover(error);
      }
    }
    retries = 0;
    return {
      get template() {
        return session!.template;
      },
      requestAttempts: () => requests,
      fetch: async (input, signal) => {
        const page = new URL(input);
        if (
          page.origin !== 'https://www.tiktok.com' ||
          page.username ||
          page.password ||
          page.hash ||
          !['/api/search/general/full/', '/api/comment/list/', '/api/comment/list/reply/'].includes(
            page.pathname,
          )
        )
          throw new LabError('INVALID_API_TARGET');
        const originalAccount = accountId;
        const videoId = page.searchParams.get('aweme_id') ?? page.searchParams.get('item_id') ?? '';
        const parentId = page.searchParams.get('comment_id');
        for (;;) {
          opts.signal.throwIfAborted();
          signal.throwIfAborted();
          try {
            if (requests >= opts.maxRequests) throw new LabError('PAGE_LIMIT');
            session ??= await opts.open(accountId!);
            const restarted = accountId !== originalAccount;
            const cursor = restarted ? '0' : (page.searchParams.get('cursor') ?? '0');
            const template = new URL(session.template);
            template.searchParams.set('keyword', opts.keyword);
            template.searchParams.delete('search_id');
            const target = page.pathname.includes('/search/')
              ? keywordSearchUrl(
                  template.toString(),
                  opts.keyword,
                  cursor,
                  restarted ? undefined : (page.searchParams.get('search_id') ?? undefined),
                )
              : page.pathname === '/api/comment/list/reply/'
                ? keywordCommentReplyUrl(
                    template.toString(),
                    opts.keyword,
                    videoId,
                    parentId ?? '',
                    cursor,
                  )
                : keywordCommentUrl(template.toString(), opts.keyword, videoId, cursor);
            requests++;
            let response: TransportResult;
            try {
              response = await session.fetch(target, signal);
            } catch (error) {
              opts.evidence({
                kind: 'request-attempt',
                accountId,
                request: requests,
                path: page.pathname,
                cursor,
                videoId,
                parentId,
                status: null,
                bytes: 0,
                error: errorCode(error),
                restarted,
              });
              throw error;
            }
            const code = responseError(response);
            opts.evidence({
              kind: 'request-attempt',
              accountId,
              request: requests,
              path: page.pathname,
              cursor,
              videoId,
              parentId,
              status: response.status,
              bytes: Buffer.byteLength(response.text),
              error: code,
              restarted,
            });
            if (code) throw new LabError(code);
            retries = 0;
            return { ...response, paginationRestart: restarted };
          } catch (error) {
            signal.throwIfAborted();
            await recover(error, page);
          }
        }
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
