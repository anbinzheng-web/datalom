import { cookieHeader, type PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';
import { pageJSState } from '@datalom/platform-runtime/contracts/page-js-state';
import { proxyDocumentGet } from '@datalom/platform-runtime/reverse-transports';
import { LabError, errorCode, type TransportResult } from '@datalom/platform-runtime/reverse-core';

// Calibrated against the native 2026-09-16 search request and the same account's
// __UNIVERSAL_DATA_FOR_REHYDRATION__ app-context. No foreign profile IDs or tokens.
export function keywordDocumentState(html: string, credential: PoolCredential, keyword: string) {
  const environment = credential.browserEnvironment;
  if (!environment) throw new LabError('BROWSER_ENVIRONMENT_REQUIRED');
  const match = html.match(
    /<script\b[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new LabError('SEARCH_BOOTSTRAP_MISSING');
  let app: any;
  try {
    app = JSON.parse(match[1])?.__DEFAULT_SCOPE__?.['webapp.app-context'];
  } catch {
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  }
  const identifier = (value: unknown) =>
    (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  if (
    !app ||
    !identifier(app.wid) ||
    !identifier(app.webIdCreatedTime) ||
    !identifier(app.odinId) ||
    typeof app.language !== 'string' ||
    typeof app.region !== 'string' ||
    !identifier(app.user?.uid)
  )
    throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  const env = environment;
  const url = new URL('https://www.tiktok.com/search');
  url.searchParams.set('lang', app.language);
  url.searchParams.set('q', keyword);
  const query = new URL('https://www.tiktok.com/api/search/general/full/');
  const platform = env.navigator.userAgentData?.platform ?? env.navigator.platform;
  const os = /win/i.test(platform)
    ? 'windows'
    : /mac/i.test(platform)
      ? 'mac'
      : /linux/i.test(platform)
        ? 'linux'
        : null;
  if (!os) throw new LabError('BROWSER_PLATFORM_UNSUPPORTED');
  const params: Record<string, string> = {
    WebIdLastTime: String(app.webIdCreatedTime),
    aid: '1988',
    app_language: app.language,
    app_name: 'tiktok_web',
    browser_language: env.navigator.language,
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: env.navigator.platform,
    browser_version: env.navigator.userAgent.replace(/^Mozilla\//, ''),
    channel: 'tiktok_web',
    cookie_enabled: String(env.navigator.cookieEnabled),
    count: '12',
    cursor: '0',
    data_collection_enabled: 'true',
    device_id: String(app.wid),
    device_platform: 'web_pc',
    device_type: 'web_h265',
    focus_state: 'true',
    from_page: 'search',
    history_len: '2',
    is_fullscreen: 'false',
    is_non_personalized_search: '0',
    is_page_visible: 'true',
    keyword,
    odinId: String(app.odinId),
    offset: '0',
    os,
    priority_region: app.region,
    referer: '',
    region: app.region,
    root_referer: '',
    screen_height: String(env.screen.height),
    screen_width: String(env.screen.width),
    tz_name: env.timezone,
    user_is_login: 'true',
    webcast_language: app.language,
    web_search_code: JSON.stringify({
      tiktok: {
        client_params_x: {
          search_engine: {
            ies_mt_user_live_video_card_use_libra: 1,
            mt_search_general_user_live_card: 1,
          },
        },
        search_server: {},
      },
    }),
  };
  if (typeof app.abTestVersion?.versionName === 'string')
    params.client_ab_versions = app.abTestVersion.versionName;
  const fingerprint = credential.cookies.find((c) => c.name === 's_v_web_id');
  if (fingerprint) params.verifyFp = fingerprint.value;
  for (const [key, value] of Object.entries(params)) query.searchParams.set(key, value);
  const now = Date.now();
  const state = pageJSState.safeParse({
    schemaVersion: 1,
    capturedAt: new Date(now).toISOString(),
    url: url.toString(),
    searchTemplate: query.toString(),
    referrer: '',
    documentCookie: cookieHeader(
      credential.cookies.filter((c) => !c.httpOnly),
      url.toString(),
    ),
    // A missing search template does not mean the imported account has no SDK
    // state. Keep its own storage when refreshing the document-derived query.
    localStorage: credential.pageJSState?.localStorage ?? {},
    sessionStorage: credential.pageJSState?.sessionStorage ?? {},
    omittedStorage: credential.pageJSState?.omittedStorage ?? [],
    timeOrigin: now,
    performanceNow: 0,
    visibilityState: 'visible',
    readyState: 'complete',
    bootstrap: { wid: app.wid, language: app.language, region: app.region, hasUser: true },
    sdkGlobals: credential.pageJSState?.sdkGlobals ?? [],
    initCapture: credential.pageJSState?.initCapture ?? 'not-observed',
  });
  if (!state.success) throw new LabError('SEARCH_BOOTSTRAP_INVALID');
  return state.data;
}

export async function bootstrapKeywordCredential(options: {
  credential: PoolCredential;
  keyword: string;
  signal: AbortSignal;
  request: typeof proxyDocumentGet;
  evidence: (entry: Record<string, unknown>) => void;
}) {
  const { credential, keyword, signal, request, evidence } = options;
  const target = new URL('https://www.tiktok.com/search');
  target.searchParams.set('lang', 'en');
  target.searchParams.set('q', keyword);
  const started = performance.now();
  let response: TransportResult;
  try {
    response = await request(
      {
        cookie: cookieHeader(credential.cookies, target.toString()),
        proxy: credential.proxy ?? undefined,
        userAgent: credential.userAgent,
        browserEnvironment: credential.browserEnvironment,
      },
      target.toString(),
      signal,
    );
  } catch (error) {
    evidence({
      kind: 'search-bootstrap',
      httpStatus: null,
      responseBytes: 0,
      durationMs: Math.round(performance.now() - started),
      source: 'proxy-http-document',
      browserUsed: false,
      error: errorCode(error),
    });
    throw error;
  }
  evidence({
    kind: 'search-bootstrap',
    httpStatus: response.status,
    responseBytes: Buffer.byteLength(response.text),
    durationMs: Math.round(performance.now() - started),
    source: 'proxy-http-document',
    browserUsed: false,
  });
  if (response.status === 429) throw new LabError('RATE_LIMITED');
  if (response.status !== 200) throw new LabError('SEARCH_BOOTSTRAP_HTTP_FAILED');
  if (!response.text.trim()) throw new LabError('SEARCH_BOOTSTRAP_EMPTY');
  return { ...credential, pageJSState: keywordDocumentState(response.text, credential, keyword) };
}
