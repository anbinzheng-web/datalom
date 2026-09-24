import { RoxyBrowserClient } from "@roxybrowser/openapi";
import { chromium } from "playwright";
import {
  SpiderError,
  type ProxyEndpoint,
  type SessionSecret,
} from "../../../core/contracts.ts";
export interface RoxyConfig {
  host: string;
  workspaceId: string;
  apiKey?: string;
  upstream: ProxyEndpoint;
}
export function assertLocalUrl(value: string): URL {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new SpiderError(
      "INVALID_INPUT",
      "RoxyBrowser 地址必须为本机 HTTP 地址",
    );
  return u;
}
export const platformOrigin = (origin: string) => {
  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com"))
    );
  } catch {
    return false;
  }
};
export class RoxyConnector {
  private sdk?: RoxyBrowserClient;
  constructor(public config: RoxyConfig) {
    assertLocalUrl(config.host);
    if (config.apiKey)
      this.sdk = new RoxyBrowserClient({
        baseUrl: config.host,
        apiKey: config.apiKey,
        workspaceId: config.workspaceId,
        timeout: 15000,
      });
  }
  // Local Roxy installations may expose read-only endpoints without an API key.
  // The SDK requires a key unconditionally; use the documented GET endpoints only in that mode.
  private async get(path: string, params: Record<string, string> = {}) {
    const u = new URL(path, this.config.host);
    if (this.config.workspaceId)
      u.searchParams.set("workspaceId", this.config.workspaceId);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const j = (await r.json()) as any;
    if (!r.ok || j.code !== 0)
      throw new SpiderError(
        "INVALID_INPUT",
        "RoxyBrowser 读取失败，请检查 API 地址、工作区和 API Key",
      );
    return j.data;
  }
  async workspaces(): Promise<any[]> {
    const d = this.sdk
      ? await this.sdk.workspaces.listAll()
      : await this.get("/workspace/list");
    return Array.isArray(d) ? d : ((d as any).rows ?? []);
  }
  async profiles(): Promise<any[]> {
    const d = this.sdk
      ? await this.sdk.profiles.list({ page: 1, pageSize: 100 })
      : await this.get("/browser/list_v3", {
          page_index: "1",
          page_size: "100",
        });
    const rows = (d as any).items ?? (d as any).rows ?? [];
    const open = this.sdk
      ? await this.sdk.profiles.connectionInfo()
      : await this.get("/browser/connection_info");
    const connections = Array.isArray(open) ? open : ((open as any).rows ?? []);
    for (const p of connections) {
      if (!rows.some((r: any) => r.dirId === p.dirId)) {
        try {
          rows.unshift(await this.detail(p.dirId));
        } catch {}
      }
    }
    return rows
      .map((p: any) => ({
        id: p.dirId,
        name: p.windowName ?? p.name ?? p.dirId,
        coreVersion: p.coreVersion,
        open: connections.some((c: any) => c.dirId === p.dirId),
      }))
      .sort((a: any, b: any) => Number(b.open) - Number(a.open));
  }
  async detail(profileId: string): Promise<any> {
    if (this.sdk) return this.sdk.profiles.get(profileId);
    const d = await this.get("/browser/detail", { dirId: profileId });
    const p = d.rows?.[0];
    if (!p)
      throw new SpiderError("INVALID_INPUT", "当前工作区中没有此 Profile");
    return p;
  }
  async endpoint(profileId: string): Promise<string> {
    const d = this.sdk
      ? await this.sdk.profiles.connectionInfo([profileId])
      : await this.get("/browser/connection_info", { dirIds: profileId });
    const row = (Array.isArray(d) ? d : ((d as any).rows ?? [])).find(
      (x: any) => x.dirId === profileId,
    );
    if (!row?.ws)
      throw new SpiderError(
        "INVALID_INPUT",
        "请先在 RoxyBrowser 中打开该 Profile 并完成登录",
      );
    const url = new URL(row.ws);
    if (
      !["ws:", "wss:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      throw new SpiderError("INVALID_INPUT", "仅接受本机浏览器调试连接");
    return row.ws;
  }
  async extract(profileId: string): Promise<{
    secret: SessionSecret;
    label: string;
    identity: string;
    warnings: string[];
  }> {
    const detail = await this.detail(profileId),
      endpoint = await this.endpoint(profileId);
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
    try {
      const context = browser.contexts()[0];
      const page = context?.pages().find((p) => platformOrigin(p.url()));
      if (!page)
        throw new SpiderError(
          "INVALID_INPUT",
          "此 Profile 没有已打开的 TikTok 页面",
        );
      const observed = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: [...navigator.languages],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        screen: {
          width: screen.width,
          height: screen.height,
          colorDepth: screen.colorDepth,
        },
        viewport: { width: innerWidth, height: innerHeight },
        clientHints: (navigator as any).userAgentData?.toJSON?.(),
        capturedAt: Date.now(),
      }));
      const cdp = await context.newCDPSession(page);
      const raw = await cdp.send("Storage.getCookies");
      await cdp.detach();
      const cookies = raw.cookies
        .filter((c) => {
          const host = c.domain.replace(/^\./, "");
          return host === "tiktok.com" || host.endsWith(".tiktok.com");
        })
        .map((c) => ({ ...c, sameSite: c.sameSite ?? "Lax" }));
      const state = await context.storageState({ indexedDB: true });
      const origins = state.origins.filter((o) => platformOrigin(o.origin));
      const session: Record<string, Record<string, string>> = {};
      for (const p of context.pages().filter((p) => platformOrigin(p.url()))) {
        const entry = await p.evaluate(() => ({
          origin: location.origin,
          data: Object.fromEntries(
            Object.keys(sessionStorage).map((k) => [
              k,
              sessionStorage.getItem(k)!,
            ]),
          ),
        }));
        session[entry.origin] = entry.data;
        const local = await p.evaluate(() => ({
          origin: location.origin,
          localStorage: Object.keys(localStorage).map((name) => ({
            name,
            value: localStorage.getItem(name)!,
          })),
        }));
        const existing = origins.find((o) => o.origin === local.origin);
        if (existing) existing.localStorage = local.localStorage;
        else origins.push(local);
      }
      const p = detail.proxyInfo;
      const protocol = String(
        p?.protocol ?? p?.proxyCategory ?? "",
      ).toLowerCase();
      const supported =
        ["http", "https", "socks5"].includes(protocol) &&
        p?.host &&
        Number(p?.port) > 0;
      const warnings: string[] = [];
      if (!supported)
        warnings.push("未读取到可用的账号代理；请求将保持禁用，禁止直连");
      if (!detail.fingerInfo)
        warnings.push(
          "此版本 Profile 详情未返回完整指纹配置，已保存浏览器实际观测值",
        );
      const route = supported
        ? {
            upstream: this.config.upstream,
            account: {
              protocol: protocol as ProxyEndpoint["protocol"],
              host: p.host,
              port: Number(p.port),
              username: p.proxyUserName ?? p.username,
              password: p.proxyPassword ?? p.password,
            },
            expectedIp: p.lastIp || undefined,
          }
        : undefined;
      return {
        label: detail.windowName ?? profileId,
        identity: await page.locator('a[href^="/@"]').evaluateAll((links) => {
          const own = links.find((a) => a.textContent?.trim() === "Profile");
          return own?.getAttribute("href")?.split("?")[0].slice(2) ?? "";
        }),
        warnings,
        secret: {
          cookies,
          storage: {
            origins,
            session,
          },
          configured: {
            coreVersion: detail.coreVersion,
            os: detail.os,
            osVersion: detail.osVersion,
            userAgent: detail.userAgent,
            fingerInfo: detail.fingerInfo ?? null,
            proxyRefreshUrl: p?.refreshUrl ?? null,
          },
          observed: { ...observed, browserVersion: browser.version() },
          route,
        },
      };
    } finally {
      await browser.close();
    }
  }
}
