import { Impit } from "impit";
import { cookieJar } from "@datalom/network-node/cookies";
import { DatalomError } from "@datalom/shared/runtime/contracts";
import type { Trace } from "@datalom/shared/runtime/diagnostics";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import type { InstagramSession } from "./session.ts";
import { applyResponseCookies } from "./response-cookies.ts";
export class InstagramTransport {
  private jar;
  private client;
  constructor(
    proxyUrl: string,
    private session: InstagramSession,
    private trace: Trace,
  ) {
    const u = new URL(proxyUrl);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1")
      throw new DatalomError(
        "PROXY_UNAVAILABLE",
        "Instagram 请求必须经过本地代理链",
      );
    this.jar = cookieJar(session);
    this.client = new Impit({
      browser: "chrome151",
      proxyUrl,
      http3: false,
      followRedirects: false,
      vanillaFallback: false,
      ignoreTlsErrors: false,
      timeout: 25000,
    });
  }
  async request(
    request: {
      url: string;
      headers: Record<string, string>;
      body?: string;
      method: "GET" | "POST";
    },
    signal: AbortSignal,
  ) {
    const u = new URL(request.url);
    if (
      u.origin !== "https://www.instagram.com" ||
      !(
        (["/api/graphql", "/graphql/query"].includes(u.pathname) &&
          request.method === "POST") ||
        (/^\/api\/v1\/media\/\d+\/info\/$/.test(u.pathname) &&
          request.method === "GET")
      ) ||
      u.username ||
      u.password
    )
      throw new DatalomError("INVALID_INPUT", "只允许 Instagram 原站 GraphQL");
    const headers = {
      ...request.headers,
      "user-agent": this.session.observed.userAgent,
      cookie: await this.jar.getCookieString(request.url),
    };
    this.trace("instagram-http", "started", {
      ...request,
      headers,
      method: request.method,
      browserUsed: false,
    });
    let response;
    try {
      response = await this.client.fetch(request.url, {
        method: request.method,
        headers,
        body: request.body,
        signal,
        redirect: "manual",
      });
    } catch (error) {
      this.trace("instagram-http", "failed", { error: errorRecord(error) });
      throw new DatalomError(
        signal.aborted ? "CANCELLED" : "NETWORK",
        "Instagram 请求失败",
        { cause: error },
      );
    }
    const h = new Headers(response.headers);
    this.trace("instagram-http-headers", "received", {
      status: response.status,
      headers: Object.fromEntries(h),
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      if (reader)
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          bytes += r.value.length;
          if (bytes > 12 * 1024 * 1024) {
            await reader.cancel();
            throw new DatalomError("SCHEMA_CHANGED", "响应超过 12 MB");
          }
          chunks.push(r.value);
        }
    } catch (error) {
      this.trace("instagram-http-body", "failed", {
        error: errorRecord(error),
        bytes,
        partial: Buffer.concat(chunks).toString("utf8"),
      });
      throw error;
    } finally {
      reader?.releaseLock();
    }
    const body = Buffer.concat(chunks).toString("utf8");
    this.trace("instagram-http", "received", {
      status: response.status,
      headers: Object.fromEntries(h),
      setCookies: h.getSetCookie(),
      body,
      bytes,
    });
    await applyResponseCookies(
      this.jar,
      h.getSetCookie(),
      request.url,
      this.trace,
    );
    this.session.cookieJar = JSON.stringify(this.jar.serializeSync());
    return { status: response.status, body, headers: h, bytes };
  }
}
