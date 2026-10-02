import { parseCookie } from 'undici';
import { NativeError } from './reverse-core.ts';

export type CookieTrace = (
  stage: string,
  outcome: string,
  payload?: Record<string, unknown>,
) => void;

function domainMatch(hostname: string, domain: string) {
  const host = hostname.replace(/^\./, '').toLowerCase();
  const d = domain.replace(/^\./, '').toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export class NativeCookieJar {
  private cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
  }[] = [];

  set(cookieHeader: string, url: string) {
    const parsed = parseCookie(cookieHeader);
    if (!parsed) throw new NativeError('SCHEMA_CHANGED', 'Set-Cookie 无法解析');
    const request = new URL(url);
    const domain = parsed.domain ? parsed.domain.toLowerCase() : request.hostname;
    const path = parsed.path?.startsWith('/')
      ? parsed.path
      : request.pathname.slice(0, request.pathname.lastIndexOf('/')) || '/';
    this.cookies = this.cookies.filter(
      (old) => !(old.name === parsed.name && old.domain === domain && old.path === path),
    );
    this.cookies.push({
      name: parsed.name,
      value: parsed.value,
      domain,
      path,
      secure: parsed.secure ?? false,
    });
  }

  header(url: string) {
    const request = new URL(url);
    return this.cookies
      .filter((cookie) => {
        const host = cookie.domain.replace(/^\./, '').toLowerCase();
        const domainMatches = request.hostname === host || request.hostname.endsWith(`.${host}`);
        const pathMatches =
          request.pathname === cookie.path ||
          (request.pathname.startsWith(cookie.path) &&
            (cookie.path.endsWith('/') || request.pathname[cookie.path.length] === '/'));
        return domainMatches && pathMatches;
      })
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }
}

export function applyResponseCookies(
  jar: NativeCookieJar,
  values: string[],
  url: string,
  trace: CookieTrace,
) {
  for (const value of values) {
    const cookie = parseCookie(value);
    if (!cookie) throw new NativeError('SCHEMA_CHANGED', 'Set-Cookie 无法解析');
    if (cookie.domain && !domainMatch(new URL(url).hostname, cookie.domain)) {
      trace('instagram-cookie', 'rejected', {
        reason: 'domain-mismatch',
        name: cookie.name,
        domain: cookie.domain,
        requestHost: new URL(url).hostname,
      });
      continue;
    }
    if (/;\s*partitioned\b/i.test(value))
      throw new NativeError('RESEARCH_REQUIRED', '响应包含未验证分区 Cookie');
    jar.set(value, url);
  }
}
