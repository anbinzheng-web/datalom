import { createHash } from 'node:crypto';
import { parseCookie } from 'undici';
import { cookieHeader, type PoolCookie } from '@datalom/platform-runtime/contracts/cookie-pool';
import { LabError } from '@datalom/platform-runtime/reverse-core';

export const youtubeOrigin = 'https://www.youtube.com';
export type YouTubeObject = Record<string, any>;
export const object = (value: unknown): YouTubeObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

// Parse JSON only. Never evaluate code served by the platform.
export function jsonAt(source: string, offset: number): YouTubeObject {
  const start = source.indexOf('{', offset);
  if (start < 0) throw new LabError('YOUTUBE_BOOTSTRAP_INVALID');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(source.slice(start, i + 1));
      } catch {
        throw new LabError('YOUTUBE_BOOTSTRAP_INVALID');
      }
    }
  }
  throw new LabError('YOUTUBE_BOOTSTRAP_INVALID');
}

export function parseYouTubeDocument(html: string) {
  const config: YouTubeObject = {};
  for (const match of html.matchAll(/ytcfg\.set\(\s*(?=\{)/g)) {
    try {
      Object.assign(config, jsonAt(html, match.index! + match[0].length));
    } catch {
      /* A later diagnostic ytcfg call can contain non-JSON data. */
    }
  }
  const dataMarker =
    /(?:var\s+)?ytInitialData\s*=\s*(?=\{)/.exec(html) ??
    /window\["ytInitialData"\]\s*=\s*(?=\{)/.exec(html);
  if (!dataMarker || !config.INNERTUBE_CONTEXT?.client?.clientVersion)
    throw new LabError('YOUTUBE_BOOTSTRAP_INVALID');
  if (config.LOGGED_IN !== true && config.LOGGED_IN !== 1) throw new LabError('LOGIN_REQUIRED');
  return { config, data: jsonAt(html, dataMarker.index + dataMarker[0].length) };
}

export function innertubeRequest(
  config: YouTubeObject,
  jar: YouTubeCookieJar,
  url: string,
  body: YouTubeObject,
  browserHeaders: Record<string, string>,
) {
  const context = structuredClone(config.INNERTUBE_CONTEXT) as YouTubeObject;
  context.client = { ...context.client, originalUrl: url };
  const json = JSON.stringify({ context, ...body });
  const now = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    accept: '*/*',
    'content-type': 'application/json',
    'user-agent': browserHeaders['user-agent'],
    origin: youtubeOrigin,
    referer: url,
    'x-youtube-client-name': String(config.INNERTUBE_CONTEXT_CLIENT_NAME ?? 1),
    'x-youtube-client-version': String(
      config.INNERTUBE_CONTEXT_CLIENT_VERSION ?? config.INNERTUBE_CLIENT_VERSION,
    ),
    'x-goog-visitor-id': String(config.VISITOR_DATA ?? ''),
    authorization: jar.auth(now),
    cookie: jar.header(url),
  };
  for (const name of ['accept-language', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'])
    if (browserHeaders[name]) headers[name] = browserHeaders[name];
  return { headers, body: json };
}

export function youtubeUrlAllowed(url: URL, method: string) {
  return (
    url.origin === youtubeOrigin &&
    !url.hash &&
    ((method === 'GET' && ['/results', '/watch'].includes(url.pathname)) ||
      (method === 'POST' && ['/youtubei/v1/search', '/youtubei/v1/next'].includes(url.pathname)))
  );
}

export class YouTubeCookieJar {
  constructor(private cookies: PoolCookie[]) {
    this.cookies = cookies.map((c) => ({ ...c }));
  }
  header(url: string) {
    return cookieHeader(this.cookies, url);
  }
  receive(values: string[], target: string) {
    const url = new URL(target);
    for (const value of values) {
      // Partitioned visitor cookies do not overwrite an unpartitioned login cookie.
      if (/;\s*partitioned\b/i.test(value)) continue;
      const c = parseCookie(value);
      if (!c) throw new LabError('YOUTUBE_COOKIE_INVALID');
      const domain = c.domain?.toLowerCase() ?? url.hostname;
      const host = domain.replace(/^\./, '');
      if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) continue;
      const path = c.path?.startsWith('/') ? c.path : '/';
      this.cookies = this.cookies.filter(
        (old) => !(old.name === c.name && old.domain === domain && old.path === path),
      );
      const expiresValue = c.expires;
      const expires =
        c.maxAge != null
          ? Date.now() / 1000 + c.maxAge
          : typeof expiresValue === 'number'
            ? expiresValue
            : expiresValue
              ? expiresValue.getTime() / 1000
              : -1;
      if (expires !== -1 && expires <= Date.now() / 1000) continue;
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
  auth(now = Math.floor(Date.now() / 1000)) {
    const values = new Map(
      this.header(youtubeOrigin + '/')
        .split('; ')
        .map((part) => {
          const equal = part.indexOf('=');
          return [part.slice(0, equal), part.slice(equal + 1)];
        }),
    );
    const signatures: string[] = [];
    const add = (name: string, scheme: string) => {
      const sid = values.get(name);
      if (!sid) return;
      const hash = createHash('sha1').update(`${now} ${sid} ${youtubeOrigin}`).digest('hex');
      signatures.push(`${scheme} ${now}_${hash}`);
    };
    add('SAPISID', 'SAPISIDHASH');
    add('__Secure-3PAPISID', 'SAPISID3PHASH');
    if (!signatures.length) throw new LabError('LOGIN_REQUIRED');
    return signatures.join(' ');
  }
}
