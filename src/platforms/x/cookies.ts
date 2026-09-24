import { CookieJar, Cookie, domainMatch } from "tough-cookie";
import { cookieJar } from "../../network/cookies.ts";
import { SpiderError, type BrowserCookie } from "../../core/contracts.ts";
import type { Trace } from "../../core/diagnostics.ts";
import type { XSession } from "./session.ts";
// This executor supports exactly one top-level context. Partitioned cookies
// never enter the ordinary jar, and both stores survive response updates.
export class XCookies {
  private normal: CookieJar;
  private partition: CookieJar;
  constructor(
    private session: XSession,
    private trace: Trace,
  ) {
    const matched: BrowserCookie[] = [];
    for (const c of session.cookies.filter(
      (c) => c.partitionKey || c.partitionKeyOpaque,
    )) {
      const p = c.partitionKey;
      if (
        c.partitionKeyOpaque ||
        !p ||
        typeof p === "string" ||
        typeof p.hasCrossSiteAncestor !== "boolean"
      )
        throw new SpiderError("RESEARCH_REQUIRED", "Cookie 分区上下文不完整");
      if (p.topLevelSite === "https://x.com" && !p.hasCrossSiteAncestor) {
        if (!c.secure)
          throw new SpiderError(
            "SCHEMA_CHANGED",
            "Partitioned Cookie 必须 Secure",
          );
        matched.push({ ...c, partitionKey: undefined });
      } else
        trace("x-cookie", "excluded", {
          name: c.name,
          reason: "partition-context-mismatch",
          partitionKey: p,
        });
    }
    this.normal = cookieJar({
      ...session,
      cookies: session.cookies.filter(
        (c) => !c.partitionKey && !c.partitionKeyOpaque,
      ),
    });
    this.partition = cookieJar({
      ...session,
      cookies: matched,
      cookieJar: session.partitionCookieJar,
    });
  }
  private guard(url: string) {
    if (new URL(url).origin !== "https://x.com")
      throw new SpiderError("INVALID_INPUT", "Cookie 仅用于 X 同源顶层上下文");
  }
  async getCookies(url: string) {
    this.guard(url);
    return [
      ...(await this.normal.getCookies(url)),
      ...(await this.partition.getCookies(url)),
    ];
  }
  async getCookieString(url: string) {
    return (await this.getCookies(url))
      .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
      .map((c) => c.cookieString())
      .join("; ");
  }
  async update(values: string[], url: string) {
    this.guard(url);
    for (const value of values) {
      const c = Cookie.parse(value);
      if (!c) throw new SpiderError("SCHEMA_CHANGED", "Set-Cookie 无法解析");
      if (c.domain && !domainMatch(new URL(url).hostname, c.domain)) {
        this.trace("x-cookie", "rejected", {
          name: c.key,
          reason: "domain-mismatch",
        });
        continue;
      }
      const partitioned = /;\s*partitioned\b/i.test(value);
      if (partitioned && !c.secure)
        throw new SpiderError(
          "SCHEMA_CHANGED",
          "Partitioned Cookie 必须 Secure",
        );
      await (partitioned ? this.partition : this.normal).setCookie(c, url);
    }
    this.session.cookieJar = JSON.stringify(this.normal.serializeSync());
    this.session.partitionCookieJar = JSON.stringify(
      this.partition.serializeSync(),
    );
  }
}
