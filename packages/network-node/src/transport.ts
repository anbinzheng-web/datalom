import { Impit } from "impit";
import { CookieJar } from "tough-cookie";
import { errorRecord, type Trace } from "@datalom/runtime-node/diagnostics";
import {
  DatalomError,
  type Transport,
  type TransportResponse,
} from "@datalom/runtime-node/contracts";
export class HttpTransport implements Transport {
  private client: Impit;
  constructor(
    proxyUrl: string,
    private jar: CookieJar,
    private defaults: Record<string, string> = {},
    private hosts = [
      "www.tiktok.com",
      "tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
      "webcast.us.tiktok.com",
    ],
    private trace?: Trace,
  ) {
    const p = new URL(proxyUrl);
    if (p.protocol !== "http:" || p.hostname !== "127.0.0.1")
      throw new DatalomError("PROXY_UNAVAILABLE", "请求必须经过本地账号代理链");
    this.client = new Impit({
      // The generic "chrome" preset produced empty TikTok responses in live
      // differential tests. Pin the independently verified transport profile.
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
    url: string,
    options: {
      headers?: Record<string, string>;
      signal: AbortSignal;
      method?: string;
      body?: string;
    },
  ): Promise<TransportResponse> {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      !this.hosts.includes(u.hostname) ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443")
    )
      throw new DatalomError("INVALID_INPUT", "目标地址不在允许的平台域名中");
    const headers = { ...this.defaults, ...options.headers };
    const cookie = await this.jar.getCookieString(url);
    if (cookie) headers.cookie = cookie;
    if (options.method && options.method !== "GET")
      throw new DatalomError("INVALID_INPUT", "当前仅支持只读 GET 操作");
    let r;
    const started = Date.now();
    this.trace?.("http", "started", {
      url,
      method: "GET",
      headers,
      transport: "impit/chrome151",
    });
    try {
      r = await this.client.fetch(url, {
        signal: options.signal,
        method: "GET",
        headers,
        redirect: "manual",
      });
    } catch (error) {
      this.trace?.("http", "failed", {
        error: errorRecord(error),
        durationMs: Date.now() - started,
      });
      if (options.signal.aborted)
        throw new DatalomError("CANCELLED", "请求已取消或超时", {
          cause: error,
        });
      throw new DatalomError("NETWORK", "代理链请求失败", { cause: error });
    }
    const h = new Headers(r.headers);
    this.trace?.("http-headers", "received", {
      status: r.status,
      headers: Object.fromEntries(h),
      setCookie: h.getSetCookie(),
      durationMs: Date.now() - started,
    });
    if (h.get("content-length") && Number(h.get("content-length")) > 20_000_000)
      throw new DatalomError("SCHEMA_CHANGED", "响应超过 20 MB 限制");
    const reader = r.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 20_000_000) {
            await reader.cancel();
            throw new DatalomError("SCHEMA_CHANGED", "响应超过 20 MB 限制");
          }
          chunks.push(chunk.value);
        }
      } catch (error) {
        this.trace?.("http-body", "failed", {
          error: errorRecord(error),
          partialBody: Buffer.concat(chunks).toString("utf8"),
          receivedBytes: size,
          truncated: true,
        });
        throw error;
      } finally {
        reader.releaseLock();
      }
    const body = Buffer.concat(chunks).toString("utf8");
    this.trace?.("http", "received", {
      status: r.status,
      body,
      bytes: size,
      durationMs: Date.now() - started,
    });
    for (const value of h.getSetCookie()) {
      if (/;\s*partitioned\b/i.test(value))
        throw new DatalomError(
          "RESEARCH_REQUIRED",
          "响应设置了分区 Cookie，需要先实现并验证分区语义",
        );
      await this.jar.setCookie(value, url);
    }
    return { status: r.status, headers: h, body };
  }
}
