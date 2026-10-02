import { RoxyBrowserClient } from '@roxybrowser/openapi';
import { chromium } from 'playwright';
import { checkCollectedSession, checkSession } from './session-check.ts';
import {
  DatalomError,
  type ProxyEndpoint,
  type SessionSecret,
} from '@datalom/shared/runtime/contracts';
export interface RoxyConfig {
  host: string;
  workspaceId: string;
  apiKey?: string;
  upstream?: ProxyEndpoint;
}
export const platformDomains: Record<string, string[]> = {
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  doubao: ['doubao.com'],
};
export function matchesPlatform(host: string, platform: string) {
  return (platformDomains[platform] ?? []).some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
export function assertLocalUrl(value: string): URL {
  const u = new URL(value);
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new DatalomError('INVALID_INPUT', 'RoxyBrowser 地址必须为本机 HTTP 地址');
  return u;
}
export const platformOrigin = (origin: string, platform = 'tiktok') => {
  try {
    const u = new URL(origin);
    return u.protocol === 'https:' && matchesPlatform(u.hostname, platform);
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
        timeout: 30000,
      });
  }
  // Local Roxy installations may expose read-only endpoints without an API key.
  // The SDK requires a key unconditionally; use the documented GET endpoints only in that mode.
  private async get(path: string, params: Record<string, string> = {}) {
    const u = new URL(path, this.config.host);
    if (this.config.workspaceId) u.searchParams.set('workspaceId', this.config.workspaceId);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    const j = (await r.json()) as any;
    if (!r.ok || j.code !== 0)
      throw new DatalomError(
        'INVALID_INPUT',
        'RoxyBrowser 读取失败，请检查 API 地址、工作区和 API Key',
      );
    return j.data;
  }
  async workspaces(): Promise<any[]> {
    const d = this.sdk ? await this.sdk.workspaces.listAll() : await this.get('/workspace/list');
    return Array.isArray(d) ? d : ((d as any).rows ?? []);
  }
  async profiles(): Promise<any[]> {
    const d = this.sdk
      ? await this.sdk.profiles.list({ page: 1, pageSize: 100 })
      : await this.get('/browser/list_v3', {
          page_index: '1',
          page_size: '100',
        });
    const rows = (d as any).items ?? (d as any).rows ?? [];
    const open = this.sdk
      ? await this.sdk.profiles.connectionInfo()
      : await this.get('/browser/connection_info');
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
    const d = await this.get('/browser/detail', { dirId: profileId });
    const p = d.rows?.[0];
    if (!p) throw new DatalomError('INVALID_INPUT', '当前工作区中没有此 Profile');
    return p;
  }
  async endpoint(profileId: string): Promise<string> {
    const d = this.sdk
      ? await this.sdk.profiles.connectionInfo([profileId])
      : await this.get('/browser/connection_info', { dirIds: profileId });
    const row = (Array.isArray(d) ? d : ((d as any).rows ?? [])).find(
      (x: any) => x.dirId === profileId,
    );
    if (!row?.ws)
      throw new DatalomError('INVALID_INPUT', '请先在 RoxyBrowser 中打开该 Profile 并完成登录');
    const url = new URL(row.ws);
    if (
      !['ws:', 'wss:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new DatalomError('INVALID_INPUT', '仅接受本机浏览器调试连接');
    return row.ws;
  }
  async open(profileId: string) {
    if (!this.sdk) throw new DatalomError('INVALID_INPUT', '自动打开 Profile 需要 API Key');
    const connections = await this.sdk.profiles.connectionInfo([profileId]);
    if (!connections.some((row) => row.dirId === profileId && row.ws)) {
      await this.sdk.profiles.open(profileId, { forceOpen: false });
    }
  }
  async close(profileId: string) {
    if (!this.sdk) throw new DatalomError('INVALID_INPUT', '关闭 Profile 需要 API Key');
    await this.sdk.profiles.close(profileId);
  }
  async browserNumber(profileId: string): Promise<string | undefined> {
    if (!this.sdk) return undefined;
    const workspaces = await this.workspaces();
    const workspace = workspaces.find((w) => String(w.id) === this.config.workspaceId);
    const prefix = String(workspace?.workspaceName ?? workspace?.name ?? '')
      .trim()
      .slice(0, 3)
      .toUpperCase();
    for (let page = 1; page <= 200; page++) {
      const batch = await this.sdk.profiles.list({ page, pageSize: 100 });
      const profile = batch.rows.find((p) => p.dirId === profileId);
      if (profile) {
        const n = Number(profile.windowSortNum);
        return prefix && Number.isSafeInteger(n) && n > 0
          ? `${prefix}-${String(n).padStart(4, '0')}`
          : undefined;
      }
      if (page * 100 >= batch.total || !batch.rows.length) break;
    }
    return undefined;
  }
  async extract(
    profileId: string,
    platform = 'tiktok',
    openPage = false,
  ): Promise<{
    secret: SessionSecret;
    label: string;
    identity: string;
    warnings: string[];
  }> {
    if (!platformDomains[platform]) throw new DatalomError('INVALID_INPUT', '不支持的平台');
    const detail = await this.detail(profileId),
      endpoint = await this.endpoint(profileId);
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
    try {
      const context = browser.contexts()[0];
      let page = context?.pages().find((p) => platformOrigin(p.url(), platform));
      if (!page && context && openPage) {
        page = await context.newPage();
        await page.goto(`https://${platformDomains[platform][0]}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      }
      if (!page) throw new DatalomError('INVALID_INPUT', '此 Profile 没有已打开的对应平台页面');
      const browserNumber = await this.browserNumber(profileId);
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
      const raw = await cdp.send('Storage.getCookies');
      await cdp.detach();
      const cookies = raw.cookies
        .filter((c) => {
          const host = c.domain.replace(/^\./, '');
          return matchesPlatform(host, platform);
        })
        .map((c) => ({ ...c, sameSite: c.sameSite ?? 'Lax' }));
      const state = await context.storageState({ indexedDB: true });
      if (!cookies.length)
        throw new DatalomError('INVALID_INPUT', '未读取到平台 Cookie，请在浏览器中完成登录后重试');
      const origins = state.origins.filter((o) => platformOrigin(o.origin, platform));
      const session: Record<string, Record<string, string>> = {};
      for (const p of context.pages().filter((p) => platformOrigin(p.url(), platform))) {
        const entry = await p.evaluate(() => ({
          origin: location.origin,
          data: Object.fromEntries(
            Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)!]),
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
      const protocol = String(p?.protocol ?? p?.proxyCategory ?? '').toLowerCase();
      const supported =
        ['http', 'https', 'socks5'].includes(protocol) && p?.host && Number(p?.port) > 0;
      const warnings: string[] = [];
      if (!supported) warnings.push('未读取到可用的账号代理；请求将保持禁用，禁止直连');
      const route =
        supported
          ? {
              upstream: this.config.upstream,
              account: {
                protocol: protocol as ProxyEndpoint['protocol'],
                host: p.host,
                port: Number(p.port),
                username: p.proxyUserName ?? p.username,
                password: p.proxyPassword ?? p.password,
              },
              expectedIp: p.lastIp || undefined,
            }
          : undefined;
      const sessionCheck =
        platform === 'facebook' || platform === 'instagram' || platform === 'x'
          ? await checkCollectedSession({
              platform,
              cookies,
              userAgent: observed.userAgent,
              proxy: route?.account,
            })
          : await checkSession(page, platform);
      return {
        label: detail.windowName ?? profileId,
        identity:
          sessionCheck.identity ||
          (platform === 'tiktok'
            ? await page.locator('a[href^="/@"]').evaluateAll((links) => {
                const own = links.find((a) => a.textContent?.trim() === 'Profile');
                return own?.getAttribute('href')?.split('?')[0].slice(2) ?? '';
              })
            : ''),
        warnings,
        secret: {
          cookies,
          storage: {
            origins,
            session,
          },
          configured: {
            browserNumber,
            platform,
            proxyInfo: p ?? null,
            coreVersion: detail.coreVersion,
            os: detail.os,
            osVersion: detail.osVersion,
            userAgent: detail.userAgent,
            fingerInfo: detail.fingerInfo ?? null,
            proxyRefreshUrl: p?.refreshUrl ?? null,
          },
          observed: { ...observed, browserVersion: browser.version(), sessionCheck },
          route,
        },
      };
    } finally {
      await browser.close();
    }
  }
}
