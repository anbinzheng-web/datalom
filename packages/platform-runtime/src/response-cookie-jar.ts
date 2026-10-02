import { parseCookie } from 'undici';
import { cookieHeader, poolCookie, type PoolCookie } from './contracts/cookie-pool.ts';

// Private per-session state. Never persist response Cookie values to diagnostics.
export class ResponseCookieJar {
  private cookies: PoolCookie[];
  constructor(initial: PoolCookie[]) {
    this.cookies = structuredClone(initial);
  }
  header(target: string, document = false) {
    return cookieHeader(
      this.cookies.filter((c) => !document || !c.httpOnly),
      target,
    );
  }
  applyMsToken(token: string, now = Date.now() / 1000) {
    if (!token || token.length > 4096 || /[\r\n;]/.test(token)) return;
    this.receive(
      'https://www.tiktok.com/',
      [`msToken=${token}; Domain=.tiktok.com; Path=/; Secure`],
      now,
    );
  }
  receive(target: string, values: string[], now = Date.now() / 1000) {
    const url = new URL(target);
    if (url.origin !== 'https://www.tiktok.com') return;
    for (const value of values.slice(0, 100)) {
      const c = parseCookie(value);
      if (!c) continue;
      const host = c.domain?.replace(/^\./, '').toLowerCase();
      if (host && !['tiktok.com', 'www.tiktok.com'].includes(host)) continue;
      const domain = host ? '.' + host : url.hostname;
      const path = c.path?.startsWith('/')
        ? c.path
        : url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
      if (c.name.startsWith('__Secure-') && !c.secure) continue;
      if (c.name.startsWith('__Host-') && (!c.secure || c.domain || path !== '/')) continue;
      const parsed = poolCookie.safeParse({
        name: c.name,
        value: c.value,
        domain,
        path,
        expires:
          c.maxAge !== undefined
            ? now + c.maxAge
            : c.expires instanceof Date
              ? c.expires.getTime() / 1000
              : -1,
        secure: c.secure ?? false,
        httpOnly: c.httpOnly ?? false,
        sameSite: c.sameSite ?? 'Lax',
      });
      if (!parsed.success) continue;
      const next = parsed.data;
      this.cookies = this.cookies.filter(
        (old) =>
          !(
            old.name === next.name &&
            old.domain.replace(/^\./, '') === next.domain.replace(/^\./, '') &&
            old.path === next.path
          ),
      );
      if ((next.expires === -1 || next.expires > now) && this.cookies.length < 300)
        this.cookies.push(next);
    }
  }
}
