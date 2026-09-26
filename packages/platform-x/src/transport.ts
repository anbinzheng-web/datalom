import { resolveMainScript, parseQueryRegistry } from "./registry.ts";
import { XTransaction, resolveTransactionScript } from "./transaction.ts";
import { createHash } from "node:crypto";
import { operationUrl } from "./native.ts";
import { Impit } from "impit";
import { XCookies } from "./cookies.ts";
import { DatalomError } from "@datalom/runtime-node/contracts";
import type { Trace } from "@datalom/runtime-node/diagnostics";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import type { XSession } from "./session.ts";

export class XTransport {
  private jar;
  private client;
  private transaction?: XTransaction;
  private queryIds = new Map<string, string>();
  constructor(
    proxyUrl: string,
    private session: XSession,
    private trace: Trace,
  ) {
    const u = new URL(proxyUrl);
    if (u.protocol !== "http:" || u.hostname !== "127.0.0.1")
      throw new DatalomError("PROXY_UNAVAILABLE", "X 请求必须经过本地代理链");
    this.jar = new XCookies(session, trace);
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
  private async source(url: string, signal: AbortSignal) {
    const u = new URL(url);
    if (
      !(
        url === "https://x.com/home" ||
        (u.origin === "https://abs.twimg.com" &&
          /^\/responsive-web\/client-web\/(?:ondemand\.s|main)\.[a-zA-Z0-9_-]+\.js$/.test(
            u.pathname,
          ))
      ) ||
      u.search ||
      u.hash
    )
      throw new DatalomError("INVALID_INPUT", "非法 transaction 素材地址");
    this.trace("x-transaction-source", "started", { url });
    const headers = {
      "user-agent": this.session.observed.userAgent,
      accept: u.hostname === "x.com" ? "text/html" : "*/*",
    };
    this.trace("x-transaction-source-request", "started", {
      url,
      method: "GET",
      headers,
      browserUsed: false,
    });
    let r;
    try {
      r = await this.client.fetch(url, { headers, signal, redirect: "manual" });
    } catch (error) {
      this.trace("x-transaction-source", "failed", {
        url,
        error: errorRecord(error),
      });
      throw new DatalomError(
        signal.aborted ? "CANCELLED" : "NETWORK",
        "X 素材请求失败",
        { cause: error },
      );
    }
    this.trace("x-transaction-source-headers", "received", {
      url,
      status: r.status,
      headers: Object.fromEntries(r.headers),
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = r.body?.getReader();
    try {
      if (reader)
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 6 * 1024 * 1024) {
            await reader.cancel();
            throw new DatalomError("SCHEMA_CHANGED", "transaction 素材过大");
          }
          chunks.push(next.value);
        }
    } catch (error) {
      this.trace("x-transaction-source-body", "failed", {
        url,
        error: errorRecord(error),
        bytes: size,
        partial: Buffer.concat(chunks).toString("utf8"),
      });
      throw error;
    } finally {
      reader?.releaseLock();
    }
    const body = Buffer.concat(chunks).toString("utf8");
    this.trace("x-transaction-source", "received", {
      url,
      status: r.status,
      headers: Object.fromEntries(r.headers),
      body,
      bytes: size,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
    if (r.status !== 200)
      throw new DatalomError(
        "RESEARCH_REQUIRED",
        `transaction 素材 HTTP ${r.status}`,
      );
    return body;
  }
  private async initialize(signal: AbortSignal) {
    if (this.transaction) return;
    const html = await this.source("https://x.com/home", signal);
    const script = await this.source(resolveTransactionScript(html), signal);
    const mainUrl = resolveMainScript(html);
    const main = await this.source(mainUrl, signal);
    this.queryIds = parseQueryRegistry(main);
    this.transaction = XTransaction.fromSources(html, script);
    this.trace("x-query-registry", "parsed", {
      mainUrl,
      count: this.queryIds.size,
    });
  }
  private transactionId(path: string) {
    if (!this.transaction)
      throw new DatalomError("RESEARCH_REQUIRED", "transaction 未初始化");
    const value = this.transaction.generate("GET", path);
    this.trace("x-transaction", "generated", {
      method: "GET",
      path,
      idSha256: createHash("sha256").update(value).digest("hex"),
      browserUsed: false,
    });
    return value;
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
    operationUrl(request.url);
    if (request.method !== "GET")
      throw new DatalomError("INVALID_INPUT", "X 执行器仅允许 GET");
    // Load the current site's versioned operation registry before signing.
    await this.initialize(signal);
    const resolved = operationUrl(request.url);
    const currentId = this.queryIds.get(resolved.name);
    if (!currentId)
      throw new DatalomError("RESEARCH_REQUIRED", "主脚本缺少当前操作 ID");
    resolved.url.pathname = "/i/api/graphql/" + currentId + "/" + resolved.name;
    this.trace("x-query-registry", "resolved", {
      operation: resolved.name,
      capturedId: resolved.queryId,
      currentId,
      changed: currentId !== resolved.queryId,
    });
    request = { ...request, url: resolved.url.toString() };
    const transactionId = this.transactionId(resolved.url.pathname);
    const headers = {
      ...request.headers,
      "x-client-transaction-id": transactionId,
      "user-agent": this.session.observed.userAgent,
      cookie: await this.jar.getCookieString(request.url),
      "x-csrf-token":
        (await this.jar.getCookies(request.url)).find((c) => c.key === "ct0")
          ?.value ?? "",
    };
    this.trace("x-http", "started", {
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
      this.trace("x-http", "failed", { error: errorRecord(error) });
      throw new DatalomError(
        signal.aborted ? "CANCELLED" : "NETWORK",
        "X 请求失败",
        { cause: error },
      );
    }
    const h = new Headers(response.headers);
    this.trace("x-http-headers", "received", {
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
      this.trace("x-http-body", "failed", {
        error: errorRecord(error),
        bytes,
        partial: Buffer.concat(chunks).toString("utf8"),
      });
      throw error;
    } finally {
      reader?.releaseLock();
    }
    const body = Buffer.concat(chunks).toString("utf8");
    this.trace("x-http", "received", {
      status: response.status,
      headers: Object.fromEntries(h),
      setCookies: h.getSetCookie(),
      body,
      bytes,
    });
    await this.jar.update(h.getSetCookie(), request.url);
    return { status: response.status, body, headers: h, bytes };
  }
}
