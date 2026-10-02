import { chromium } from "playwright";
import { openStore } from "@datalom/shared/storage/runtime";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import { DatalomError, type ProxyEndpoint } from "@datalom/shared/runtime/contracts";
import { validateProxy } from "@datalom/network-node/route";
import { profileConnection } from "../src/connection.ts";
import { InstagramSessions, type InstagramSession } from "@datalom/platform-instagram/session";
const store = openStore(),
  profileId = process.argv[2];
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  const { endpoint, config } = await profileConnection(store, profileId);
  const u = new URL("/browser/detail", config.host);
  u.searchParams.set("workspaceId", config.workspaceId);
  u.searchParams.set("dirId", profileId);
  const response = await fetch(u, {
    headers: config.apiKey ? { apikey: config.apiKey } : {},
    signal: AbortSignal.timeout(15000),
  });
  const j = (await response.json()) as any;
  if (!response.ok || j.code !== 0)
    throw new DatalomError("INVALID_INPUT", "无法读取 Profile 线路配置");
  const detail = j.data.rows?.[0];
  const p = detail?.proxyInfo;
  const account: ProxyEndpoint = {
    protocol: String(p?.protocol ?? p?.proxyCategory).toLowerCase() as any,
    host: p?.host,
    port: Number(p?.port),
    username: p?.proxyUserName ?? p?.username,
    password: p?.proxyPassword ?? p?.password,
  };
  validateProxy(account);
  validateProxy(config.upstream as ProxyEndpoint);
  browser = await chromium.connectOverCDP(endpoint);
  const ctx = browser.contexts()[0];
  const page = ctx
    .pages()
    .find((p) => new URL(p.url()).hostname === "www.instagram.com");
  if (!page)
    throw new DatalomError("INVALID_INPUT", "当前 Profile 没有 Instagram 页面");
  const observed = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: [...navigator.languages],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
  const cdp = await ctx.newCDPSession(page);
  const all = await cdp.send("Storage.getCookies");
  await cdp.detach();
  const cookies = all.cookies
    .filter(
      (c) =>
        c.domain.replace(/^\./, "") === "instagram.com" ||
        c.domain.endsWith(".instagram.com"),
    )
    .map((c) => ({ ...c, sameSite: c.sameSite ?? "Lax" }));
  if (
    !cookies.some((c) => c.name === "ds_user_id") ||
    !cookies.some((c) => c.name === "sessionid")
  )
    throw new DatalomError("LOGIN_REQUIRED", "未提取到已登录 Instagram 会话");
  const session: InstagramSession = {
    profileId,
    capturedAt: Date.now(),
    requestCounter: 0,
    cookies,
    storage: { origins: [], session: {} },
    configured: {
      coreVersion: detail.coreVersion,
      fingerInfo: detail.fingerInfo ?? null,
    },
    observed: { ...observed, browserVersion: browser.version() },
    route: {
      upstream: config.upstream as ProxyEndpoint,
      account,
      expectedIp: p?.lastIp || undefined,
    },
  };
  new InstagramSessions(store).replace(session);
  const evidenceId = store.diagnostics.event(
    {},
    "instagram-session",
    "extracted",
    { profileId, session },
  );
  console.log({
    profileId,
    cookieCount: cookies.length,
    browserVersion: session.observed.browserVersion,
    routeConfigured: true,
    routeVerified: false,
    evidenceId,
  });
} catch (error) {
  const id = store.diagnostics.event({}, "instagram-session", "failed", {
    profileId,
    error: errorRecord(error),
  });
  console.error({ status: "failed", evidenceId: id });
  process.exitCode = 1;
} finally {
  await browser?.close();
  store.close();
}
