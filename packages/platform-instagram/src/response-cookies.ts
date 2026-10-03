import { Cookie, domainMatch, type CookieJar } from 'tough-cookie';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import type { Trace } from '@datalom/shared/runtime/diagnostics';
export async function applyResponseCookies(
  jar: CookieJar,
  values: string[],
  url: string,
  trace: Trace,
) {
  for (const value of values) {
    const cookie = Cookie.parse(value);
    if (!cookie) throw new DatalomError('SCHEMA_CHANGED', 'Set-Cookie 无法解析');
    if (cookie.domain && !domainMatch(new URL(url).hostname, cookie.domain)) {
      await trace('instagram-cookie', 'rejected', {
        reason: 'domain-mismatch',
        name: cookie.key,
        domain: cookie.domain,
        requestHost: new URL(url).hostname,
      });
      continue;
    }
    if (/;\s*partitioned\b/i.test(value))
      throw new DatalomError('RESEARCH_REQUIRED', '响应包含未验证分区 Cookie');
    await jar.setCookie(cookie, url);
  }
}
