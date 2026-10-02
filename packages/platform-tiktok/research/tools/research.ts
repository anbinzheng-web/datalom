import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { openStore } from "@datalom/shared/storage/runtime";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../src/roxy.ts";
import type { RequestTemplate } from "@datalom/shared/runtime/contracts";
const store = openStore();
const config = store.getSetting<RoxyConfig>("roxy");
if (!config) throw new Error("请先配置 RoxyBrowser");
const connector = new RoxyConnector(config);
const [command, profileId, video] = process.argv.slice(2);
try {
  if (command === "profiles") {
    console.log(await connector.profiles());
  } else if (command === "extract") {
    const result = await connector.extract(profileId);
    const account = store.importAccount(
      {
        profileId,
        workspaceId: config.workspaceId,
        label: result.label,
        identity: result.identity,
      },
      result.secret,
    );
    console.log(
      JSON.stringify({
        id: account.id,
        label: account.label,
        cookies: result.secret.cookies.length,
        hasProxy: !!result.secret.route,
        warnings: result.warnings,
      }),
    );
  } else if (command === "capture") {
    if (
      !video?.startsWith("https://www.tiktok.com/@") ||
      !new URL(video).pathname.includes("/video/")
    )
      throw new Error("需要一个已观察到的视频完整链接");
    const account = store
      .listAccounts()
      .find(
        (a) =>
          a.profileId === profileId && a.workspaceId === config.workspaceId,
      );
    if (!account) throw new Error("请先 extract");
    const lease = store.lease(account.id, true);
    if (!lease) throw new Error("账号正在使用或冷却");
    const renew = setInterval(() => store.renew(account.id, lease), 15000);
    const browser = await chromium.connectOverCDP(
      await connector.endpoint(profileId),
    );
    const page = await browser.contexts()[0].newPage();
    const pending: Promise<void>[] = [];
    const templates: Record<string, RequestTemplate> = {};
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "www.tiktok.com") return;
      const operation =
        u.pathname === "/api/comment/list/"
          ? "video.comments"
          : u.pathname === "/api/item/detail/"
            ? "video.detail"
            : null;
      if (!operation) return;
      pending.push(
        (async () => {
          try {
            const body = await r.text();
            const request = r.request();
            const headers = await request.allHeaders();
            const id = store.evidence(
              account.id,
              "capture",
              `${operation} · HTTP ${r.status()} · ${body.length} bytes`,
              { url: r.url(), headers, response: body, status: r.status() },
            );
            templates[operation] = {
              url: r.url(),
              headers,
              capturedAt: Date.now(),
            };
            console.log(
              JSON.stringify({
                evidenceId: id,
                operation,
                status: r.status(),
                bytes: body.length,
                queryNames: [...u.searchParams.keys()],
              }),
            );
          } catch {}
        })(),
      );
    });
    try {
      await page.goto(video, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(12000);
      const scripts = await page.evaluate(() =>
        [...document.scripts]
          .map((s) => s.src)
          .filter((s) => /webmssdk|secsdk/.test(s)),
      );
      console.log(
        JSON.stringify({
          title: await page.title(),
          scripts,
          apiOperations: Object.keys(templates),
        }),
      );
      await Promise.allSettled(pending);
      const session = store.getSecret(account.id);
      session.research = { requestTemplates: templates };
      store.saveSecret(account.id, account.version, session, lease);
      const html = await page.content();
      store.evidence(
        account.id,
        "page",
        `视频研究页面 · ${html.length} bytes · SHA256 ${createHash("sha256").update(html).digest("hex").slice(0, 12)}`,
        { url: video, html, scripts },
      );
    } finally {
      await page.close();
      await browser.close();
      clearInterval(renew);
      store.release(account.id, lease);
    }
  } else
    throw new Error(
      "Usage: pnpm research profiles | extract <profileId> | capture <profileId> <observedVideoUrl>",
    );
} finally {
  store.close();
}
