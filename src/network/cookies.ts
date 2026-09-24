import { Cookie, CookieJar } from "tough-cookie";
import { SpiderError, type SessionSecret } from "../core/contracts.ts";
export function cookieJar(session: SessionSecret): CookieJar {
  if (session.cookies.some((c) => c.partitionKey))
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "会话含分区 Cookie，当前执行器尚未验证分区语义；已保留原始数据",
    );
  if (session.cookieJar) return CookieJar.deserializeSync(session.cookieJar);
  const jar = new CookieJar();
  for (const c of session.cookies) {
    if (c.expires > 0 && c.expires * 1000 <= Date.now()) continue;
    const host = c.domain.replace(/^\./, "");
    const cookie = new Cookie({
      key: c.name,
      value: c.value,
      domain: host,
      path: c.path || "/",
      hostOnly: !c.domain.startsWith("."),
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite.toLowerCase() as "lax" | "strict" | "none",
      expires: c.expires > 0 ? new Date(c.expires * 1000) : "Infinity",
    });
    jar.setCookieSync(
      cookie,
      `${c.secure ? "https" : "http"}://${host}${c.path || "/"}`,
    );
  }
  return jar;
}
