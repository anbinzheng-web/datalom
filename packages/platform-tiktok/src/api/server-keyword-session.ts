import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { loadSdkManifest, SdkSession } from './tiktok-sdk-session.ts';
import { proxyApiGet, proxyDocumentGet, proxySdkExchange } from '@datalom/platform-runtime/reverse-transports';
import { openChromeTransport, proxyChromeGet } from '@datalom/platform-runtime/impit-api';
import { bootstrapKeywordCredential } from './server-keyword-bootstrap.ts';
import { LabError, errorCode, type TransportResult } from '@datalom/platform-runtime/reverse-core';
import { accountProxyAgent } from '@datalom/platform-runtime/proxy-agent';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { pause } from '@datalom/platform-runtime/pause';
import { ResponseCookieJar } from '@datalom/platform-runtime/response-cookie-jar';

export type KeywordSession = {
  template: string;
  fetch: (
    url: string,
    signal: AbortSignal,
  ) => Promise<TransportResult & { paginationRestart?: boolean }>;
  requestAttempts?: () => number;
  reconnect?: () => Promise<void>;
  close: () => void | Promise<void>;
};
function responseMsToken(headers: Record<string, string>) {
  const value = headers['x-ms-token'] ?? headers['X-Ms-Token'];
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\r\n;]/.test(value)) return;
  return value;
}

export type KeywordSessionFactory = (options: {
  manifestPath: string;
  keyword?: string;
  credential: PoolCredential;
  current: () => PoolCredential;
  signal: AbortSignal;
  request: typeof proxyApiGet;
  documentRequest?: typeof proxyDocumentGet;
  sdkRequest?: typeof proxySdkExchange;
  evidence: (value: Record<string, unknown>) => void;
}) => Promise<KeywordSession>;

// One isolated SDK per run, shared by first search, search pages and every comment page.
// URLs, SDK state and response feedback are private memory, never diagnostic artifacts.
export const createKeywordSession: KeywordSessionFactory = async (opts) => {
  let manifest: ReturnType<typeof loadSdkManifest>;
  try {
    manifest = loadSdkManifest(opts.manifestPath);
  } catch (error) {
    if (error instanceof LabError) throw error;
    throw new LabError('SDK_ASSETS_UNAVAILABLE');
  }
  if (!opts.credential.pageJSState?.searchTemplate && !opts.keyword)
    throw new LabError('SEARCH_KEYWORD_REQUIRED');
  const prepared = opts.credential.pageJSState?.searchTemplate
    ? opts.credential
    : await bootstrapKeywordCredential({
        credential: opts.current(),
        keyword: opts.keyword ?? '',
        signal: opts.signal,
        request: opts.documentRequest ?? proxyDocumentGet,
        evidence: opts.evidence,
      });
  const template = prepared.pageJSState?.searchTemplate;
  if (!template) throw new LabError('SEARCH_CONTEXT_REQUIRED');
  const sdk = new SdkSession(opts.signal);
  let transport: ReturnType<typeof accountProxyAgent> | undefined;
  let chrome: Awaited<ReturnType<typeof openChromeTransport>> | undefined;
  let connectionStage = opts.request === proxyApiGet ? 'not-connected' : 'shared-pool-connection';
  let requests = 0;
  let lastResponseToken: string | undefined;
  const jar = new ResponseCookieJar(prepared.cookies);
  try {
    await sdk.boot(manifest, prepared);
    if (!opts.credential.proxy) throw new LabError('PROXY_REQUIRED');
    if (opts.request === proxyApiGet) {
      const upstream = await accountUpstream(new URL(opts.credential.proxy.url));
      transport = accountProxyAgent(opts.credential.proxy, opts.signal, upstream, (stage) => {
        connectionStage = stage;
      });
    }
    opts.evidence({
      kind: 'sdk-session',
      ...manifest.evidence,
      signatureMode: 'original-sdk',
      sdkRegion:
        prepared.pageJSState?.bootstrap.region === 'US' ? 'ttp' : manifest.init.config.region,
      stateCapturedAt: prepared.pageJSState!.capturedAt,
      querySource: opts.credential.pageJSState?.searchTemplate
        ? 'observed-search-request'
        : 'http-bootstrap-calibrated-template',
      storedSigningStatePresent: !!(
        prepared.pageJSState?.localStorage.msToken && prepared.pageJSState.localStorage.xmst
      ),
      browserUsed: false,
      limitations: [
        'PARTIAL_JS_STATE',
        'TLS_HTTP2_NOT_REPRODUCED',
        'SDK_AUXILIARY_NETWORK_PARTIAL',
      ],
    });
    const exchangeSdkRequests = async (signal: AbortSignal) => {
      // The child queues at most four exchanges per session; all share the task's
      // abort/deadline and the selected account proxy. Bodies stay private.
      for (let pass = 0; pass < 4; pass++) {
        const queued = await sdk.auxiliary();
        if (!queued.length) break;
        for (const request of queued) {
          const started = performance.now();
          try {
            const current = opts.current();
            const response = await (opts.sdkRequest ?? proxySdkExchange)(
              { ...current, proxy: current.proxy ?? undefined },
              request,
              signal,
              transport?.dispatcher,
            );
            await sdk.auxiliaryResponse(
              request.id,
              response.status,
              response.text,
              response.headers,
            );
            const responseToken = responseMsToken(response.headers);
            if (responseToken) {
              jar.applyMsToken(responseToken);
              lastResponseToken = responseToken;
            }
            opts.evidence({
              kind: 'sdk-bootstrap-exchange',
              path: new URL(request.url).pathname,
              method: request.method,
              status: response.status,
              bytes: Buffer.byteLength(response.text),
              durationMs: Math.round(performance.now() - started),
              responseTokenPresent: !!responseToken,
            });
          } catch (error) {
            opts.evidence({
              kind: 'sdk-bootstrap-exchange',
              path: new URL(request.url).pathname,
              method: request.method,
              error: errorCode(error),
              sdk: sdk.diagnostics,
              durationMs: Math.round(performance.now() - started),
            });
            throw error;
          }
        }
      }
    };
    return {
      template,
      reconnect: async () => {
        if (opts.request !== proxyApiGet) return;
        await transport?.close();
        const credential = opts.current();
        if (!credential.proxy) throw new LabError('PROXY_REQUIRED');
        transport = accountProxyAgent(
          credential.proxy,
          opts.signal,
          await accountUpstream(new URL(credential.proxy.url)),
          (stage) => {
            connectionStage = stage;
          },
        );
      },
      fetch: async (url, signal) => {
        signal.throwIfAborted();
        if (requests++) await pause(300, signal);
        await exchangeSdkRequests(signal);
        const signed = await sdk.sign(url);
        signal.throwIfAborted();
        const credential = opts.current();
        const target = new URL(signed);
        opts.evidence({
          kind: 'sdk-request',
          path: target.pathname,
          signatureParameterNames: [...target.searchParams.keys()].filter((k) =>
            /^(X-Bogus|X-Gnarly|X-Dynosaur|_signature)$/i.test(k),
          ),
          blockedSdkNetworkRequests: sdk.diagnostics?.blockedNetworkRequests,
          tokenPresent: !!target.searchParams.get('msToken'),
          tokenLength: target.searchParams.get('msToken')?.length ?? 0,
          matchesPreviousResponseToken: lastResponseToken
            ? target.searchParams.get('msToken') === lastResponseToken
            : null,
          sdk: sdk.diagnostics,
        });
        const started = performance.now();
        let received = false;
        const comment = ['/api/comment/list/', '/api/comment/list/reply/'].includes(
          target.pathname,
        );
        try {
          const payload = {
            cookie: jar.header(signed),
            proxy: credential.proxy ?? undefined,
            userAgent: credential.userAgent,
            browserEnvironment: credential.browserEnvironment,
          };
          const receive = async (response: {
            status: number;
            text: string;
            headers: Record<string, string>;
            setCookies?: string[];
          }) => {
            received = true;
            const responseToken = responseMsToken(response.headers);
            jar.receive(signed, response.setCookies ?? []);
            if (responseToken) jar.applyMsToken(responseToken);
            await sdk.response(
              response.status,
              response.text,
              response.headers,
              jar.header(prepared.pageJSState!.url, true),
            );
            opts.evidence({
              kind: 'sdk-response-feedback',
              path: target.pathname,
              status: response.status,
              bytes: Buffer.byteLength(response.text),
              responseTokenPresent: !!responseToken,
              responseTokenLength: responseToken?.length ?? 0,
              responseTokenChanged: responseToken
                ? responseToken !== target.searchParams.get('msToken')
                : null,
              setCookieCount: response.setCookies?.length ?? 0,
              setsTokenCookie:
                response.setCookies?.some((value) => /^msToken=/i.test(value)) ?? false,
              sdk: sdk.diagnostics,
            });
            if (responseToken) lastResponseToken = responseToken;
          };
          if (comment && payload.proxy)
            chrome ??= await openChromeTransport(
              payload.proxy,
              signal,
              await accountUpstream(new URL(payload.proxy.url)),
            );
          const response = comment
            ? await proxyChromeGet(payload, signed, signal, undefined, receive, {
                keyword: opts.keyword,
                client: chrome?.client,
              })
            : await opts.request(
                payload,
                signed,
                signal,
                undefined,
                receive,
                transport?.dispatcher,
              );
          opts.evidence({
            kind: 'sdk-transport',
            path: target.pathname,
            request: requests,
            status: response.status,
            durationMs: Math.round(performance.now() - started),
            connectionStage: comment ? 'impit-chrome151' : connectionStage,
          });
          return response;
        } catch (error) {
          if (!received && !signal.aborted) await sdk.requestFailed();
          opts.evidence({
            kind: 'sdk-transport',
            path: target.pathname,
            request: requests,
            status: null,
            durationMs: Math.round(performance.now() - started),
            connectionStage: comment ? 'impit-chrome151' : connectionStage,
            error: errorCode(error),
          });
          throw error;
        }
      },
      close: async () => {
        sdk.close();
        await chrome?.close();
        await transport?.close();
      },
    };
  } catch (error) {
    sdk.close();
    await chrome?.close();
    await transport?.close();
    throw error;
  }
};
