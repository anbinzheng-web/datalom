import type { Impit } from 'impit';
import { createHash } from 'node:crypto';
import { parseCookie } from 'undici';
import type { PoolCredential, PoolCookie } from '@datalom/platform-runtime/contracts/cookie-pool';
import { cookieHeader } from '@datalom/platform-runtime/contracts/cookie-pool';
import { apiBrowserHeaders } from '@datalom/platform-runtime/api-diagnostics';
import { nativeHttpRequest } from '@datalom/platform-runtime/native-http';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';
import { resolveMainScript, parseQueryRegistry } from './x-registry.ts';
import { resolveTransactionScript, XTransaction } from './x-transaction.ts';
import {
  buildRequest,
  validateResult,
  operations,
  type Capture,
  type XOperation,
} from './x-native.ts';
import { jsonAt } from '@datalom/platform-youtube/api/youtube-native';

export function xUrlAllowed(url: URL, method: string) {
  if (method !== 'GET' || url.hash) return false;
  if (url.origin === 'https://abs.twimg.com')
    return (
      !url.search &&
      /^\/responsive-web\/client-web\/(main|ondemand\.s)\.[A-Za-z0-9_-]+\.js$/.test(url.pathname)
    );
  return (
    url.origin === 'https://x.com' &&
    ((url.pathname === '/home' && !url.search) ||
      (url.pathname === '/i/api/1.1/account/verify_credentials.json' && !url.search) ||
      /^\/i\/api\/graphql\/[A-Za-z0-9_-]+\/(SearchTimeline|TweetDetail)$/.test(url.pathname))
  );
}
export function xBootstrap(html: string, main: string) {
  const marker = /window\.__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!marker) throw new LabError('X_BOOTSTRAP_INVALID');
  let state: ReturnType<typeof jsonAt>;
  try {
    state = jsonAt(html, marker.index + marker[0].length);
  } catch {
    throw new LabError('X_BOOTSTRAP_INVALID');
  }
  const switches = state.featureSwitch;
  const authorization = main.match(/Bearer\s+[A-Za-z0-9%_-]{20,}/)?.[0];
  if (!authorization || !switches?.defaultConfig) throw new LabError('X_BOOTSTRAP_INVALID');
  const ids = parseQueryRegistry(main);
  const captures = new Map<XOperation, Capture>();
  for (const [operation, name] of Object.entries(operations)) {
    const metadata = new RegExp(
      'operationName:"' +
        name +
        '",operationType:"query",metadata:\\{featureSwitches:(\\[[^\\]]*\\])',
    ).exec(main);
    const id = ids.get(name);
    if (!metadata || !id) throw new LabError('X_BOOTSTRAP_INVALID');
    const names: unknown = JSON.parse(metadata[1]);
    if (!Array.isArray(names) || !names.every((k) => typeof k === 'string'))
      throw new LabError('X_BOOTSTRAP_INVALID');
    const features = Object.fromEntries(
      names.map((k) => [
        k,
        Boolean(switches.user?.config?.[k]?.value ?? switches.defaultConfig[k]?.value ?? false),
      ]),
    );
    const variables =
      operation === 'search.timeline'
        ? {
            rawQuery: '',
            count: 20,
            querySource: 'typed_query',
            product: 'Top',
            withGrokTranslatedBio: true,
            withQuickPromoteEligibilityTweetFields: false,
          }
        : {
            focalTweetId: '',
            with_rux_injections: false,
            rankingMode: 'Relevance',
            includePromotedContent: true,
            withCommunity: true,
            withQuickPromoteEligibilityTweetFields: true,
            withBirdwatchNotes: true,
            withVoice: true,
          };
    const url = new URL(`https://x.com/i/api/graphql/${id}/${name}`);
    url.searchParams.set('variables', JSON.stringify(variables));
    url.searchParams.set('features', JSON.stringify(features));
    if (operation === 'post.conversation')
      url.searchParams.set(
        'fieldToggles',
        JSON.stringify({
          withPayments: false,
          withArticleRichContentState: true,
          withArticlePlainText: false,
          withArticleSummaryText: true,
          withArticleVoiceOver: true,
          withGrokAnalyze: false,
          withDisallowedReplyControls: false,
        }),
      );
    captures.set(operation as XOperation, {
      name,
      method: 'GET',
      url: url.toString(),
      requestHeaders: { authorization },
    });
  }
  return captures;
}
function safeParameterShape(params: URLSearchParams) {
  const shape: Record<string, unknown> = {};
  for (const key of ['variables', 'features', 'fieldToggles']) {
    const raw = params.get(key);
    if (!raw) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      shape[key] = { parseable: false, bytes: Buffer.byteLength(raw) };
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      shape[key] = { type: Array.isArray(value) ? 'array' : typeof value };
      continue;
    }
    const fields = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, field]) => [
          name,
          name === 'rawQuery' && typeof field === 'string'
            ? { type: 'string', length: field.length }
            : name === 'cursor' && typeof field === 'string'
              ? { type: 'string', length: field.length }
              : field === null
                ? 'null'
                : Array.isArray(field)
                  ? 'array'
                  : typeof field,
        ]),
    );
    shape[key] = { fields };
  }
  return shape;
}
export class XCookieJar {
  private cookies: PoolCookie[];
  constructor(cookies: PoolCookie[]) {
    this.cookies = structuredClone(cookies);
  }
  header(url: string) {
    return cookieHeader(this.cookies, url);
  }
  receive(target: string, values: string[], now = Date.now() / 1000) {
    const url = new URL(target);
    if (url.origin !== 'https://x.com') return;
    for (const value of values) {
      // Partitioned anti-abuse cookies must not replace ordinary login cookies.
      if (/;\s*partitioned\b/i.test(value)) continue;
      const c = parseCookie(value);
      if (!c) throw new LabError('X_COOKIE_INVALID');
      const host = c.domain?.replace(/^\./, '').toLowerCase();
      if (host && host !== 'x.com') continue;
      const domain = host ? '.' + host : url.hostname;
      const path = c.path?.startsWith('/') ? c.path : '/';
      const expires =
        c.maxAge !== undefined
          ? now + c.maxAge
          : c.expires instanceof Date
            ? c.expires.getTime() / 1000
            : -1;
      this.cookies = this.cookies.filter(
        (old) =>
          !(
            old.name === c.name &&
            old.domain.replace(/^\./, '') === domain.replace(/^\./, '') &&
            old.path === path
          ),
      );
      if ((expires === -1 || expires > now) && this.cookies.length < 300)
        this.cookies.push({
          name: c.name,
          value: c.value,
          domain,
          path,
          expires,
          secure: c.secure ?? false,
          httpOnly: c.httpOnly ?? false,
        });
    }
  }
}
export class XTransport {
  private initialized?: Promise<void>;
  private captures = new Map<XOperation, Capture>();
  private tx?: XTransaction;
  private jar: XCookieJar;
  constructor(
    private client: Impit,
    private credential: PoolCredential,
    private signal: AbortSignal,
    private evidence: (e: Record<string, unknown>) => void,
    private beforeRequest?: () => void,
  ) {
    this.jar = new XCookieJar(credential.cookies);
  }
  private async exchange(url: string, headers: Record<string, string>) {
    this.signal.throwIfAborted();
    this.beforeRequest?.();
    const start = Date.now();
    try {
      const r = await nativeHttpRequest(
        this.client,
        { url, method: 'GET', headers },
        this.signal,
        xUrlAllowed,
        60_000,
      );
      this.jar.receive(url, r.setCookies);
      const parsed = new URL(url);
      const parameterNames = [...new Set([...parsed.searchParams.keys()])].sort();
      const contentType = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      let bodyKind = 'empty';
      if (r.body.trim()) {
        try {
          JSON.parse(r.body);
          bodyKind = 'json';
        } catch {
          bodyKind = /^\s*</.test(r.body) ? 'html-or-markup' : 'other';
        }
      }
      const safeHeaderHashes = Object.fromEntries(
        ['authorization', 'x-client-transaction-id', 'x-csrf-token']
          .filter((name) => typeof headers[name] === 'string')
          .map((name) => [name, createHash('sha256').update(headers[name]).digest('hex')]),
      );
      const responseHeaderNames = [...r.headers.keys()].map((name) => name.toLowerCase()).sort();
      const responseHeaderHashes = Object.fromEntries(
        [
          'cf-ray',
          'via',
          'x-cache',
          'x-served-by',
          'x-request-id',
          'x-transaction-id',
          'server-timing',
        ]
          .map((name) => [name, r.headers.get(name)])
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([name, value]) => [name, createHash('sha256').update(value).digest('hex')]),
      );
      const responseServer = r.headers
        .get('server')
        ?.replace(/[^A-Za-z0-9._ -]/g, '')
        .slice(0, 80);
      const cfCacheStatus = r.headers.get('cf-cache-status')?.slice(0, 40);
      this.evidence({
        kind: 'http-exchange',
        path: parsed.pathname,
        method: 'GET',
        status: r.status,
        bytes: r.bytes,
        durationMs: Date.now() - start,
        parameterNames,
        parameterShape: safeParameterShape(parsed.searchParams),
        requestHeaderNames: Object.keys(headers).sort(),
        requestHeaderHashes: safeHeaderHashes,
        responseHeaderNames,
        responseHeaderHashes,
        ...(responseServer ? { responseServer } : {}),
        ...(cfCacheStatus ? { cfCacheStatus } : {}),
        cookieNames: [
          ...new Set(
            (headers.cookie ?? '')
              .split(/;\s*/)
              .map((value) => value.split('=', 1)[0])
              .filter(Boolean),
          ),
        ].sort(),
        contentType,
        bodyKind,
        browserUsed: false,
      });
      return r;
    } catch (error) {
      this.evidence({
        kind: 'http-exchange',
        path: new URL(url).pathname,
        method: 'GET',
        status: null,
        bytes: 0,
        durationMs: Date.now() - start,
        error: errorCode(error),
        requestHeaderNames: Object.keys(headers).sort(),
        browserUsed: false,
      });
      throw error;
    }
  }
  private async source(url: string) {
    const env = apiBrowserHeaders(this.credential);
    const r = await this.exchange(url, {
      ...env,
      accept: url.endsWith('.js') ? '*/*' : 'text/html',
      ...(new URL(url).origin === 'https://x.com' ? { cookie: this.jar.header(url) } : {}),
    });
    if (r.status !== 200)
      throw new LabError(
        r.status === 429
          ? 'RATE_LIMIT'
          : r.status === 401
            ? 'LOGIN_REQUIRED'
            : 'X_BOOTSTRAP_HTTP_FAILED',
      );
    return r.body;
  }
  private async init() {
    this.initialized ??= (async () => {
      const cookies = this.jar.header('https://x.com/');
      if (!/(?:^|; )auth_token=[^;]+/.test(cookies) || !/(?:^|; )ct0=[^;]+/.test(cookies))
        throw new LabError('LOGIN_REQUIRED');
      const html = await this.source('https://x.com/home');
      const script = await this.source(resolveTransactionScript(html));
      const main = await this.source(resolveMainScript(html));
      this.tx = XTransaction.fromSources(html, script);
      this.captures = xBootstrap(html, main);
      this.evidence({
        kind: 'x-bootstrap',
        mainSha256: createHash('sha256').update(main).digest('hex'),
        transactionSha256: createHash('sha256').update(script).digest('hex'),
        operations: [...this.captures.keys()],
        browserUsed: false,
      });
    })();
    await this.initialized;
  }
  async request(operation: XOperation, updates: Record<string, unknown>) {
    await this.init();
    const capture = this.captures.get(operation);
    if (!capture || !this.tx) throw new LabError('X_BOOTSTRAP_INVALID');
    const built = buildRequest(operation, capture, updates);
    const r = await this.authenticatedGet(built.url, built.headers);
    return validateResult(operation, built.variables, r.status, r.body).page;
  }
  async verifyAccount() {
    await this.init();
    const capture = this.captures.get('search.timeline');
    if (!capture) throw new LabError('X_BOOTSTRAP_INVALID');
    return this.authenticatedGet(
      'https://x.com/i/api/1.1/account/verify_credentials.json',
      capture.requestHeaders,
    );
  }
  private async authenticatedGet(target: string, headers: Record<string, string>) {
    if (!this.tx) throw new LabError('X_BOOTSTRAP_INVALID');
    const url = new URL(target);
    const cookie = this.jar.header(target);
    const csrf = cookie.match(/(?:^|; )ct0=([^;]+)/)?.[1];
    if (!csrf) throw new LabError('LOGIN_REQUIRED');
    return this.exchange(target, {
      ...apiBrowserHeaders(this.credential),
      ...headers,
      accept: '*/*',
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': csrf,
      'x-client-transaction-id': this.tx.generate('GET', url.pathname),
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
    });
  }
}
