import { Cookie, domainMatch, type CookieJar } from "tough-cookie";
import { SpiderError } from "../../core/contracts.ts";
import type { Trace } from "../../core/diagnostics.ts";
export async function applyResponseCookies(
  jar: CookieJar,
  values: string[],
  url: string,
  trace: Trace,
) {
  for (const value of values) {
    const cookie = Cookie.parse(value);
    if (!cookie) throw new SpiderError("SCHEMA_CHANGED", "Set-Cookie 无法解析");
    if (cookie.domain && !domainMatch(new URL(url).hostname, cookie.domain)) {
      trace("instagram-cookie", "rejected", {
        reason: "domain-mismatch",
        name: cookie.key,
        domain: cookie.domain,
        requestHost: new URL(url).hostname,
      });
      continue;
    }
    if (/;\s*partitioned\b/i.test(value))
      throw new SpiderError("RESEARCH_REQUIRED", "响应包含未验证分区 Cookie");
    await jar.setCookie(cookie, url);
  }
}
