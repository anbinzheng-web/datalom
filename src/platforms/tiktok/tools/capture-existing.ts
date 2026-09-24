import { chromium } from "playwright";
import { openStore } from "../../../core/runtime.ts";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../research/roxy.ts";
import type { RequestTemplate } from "../../../core/contracts.ts";
const store = openStore(),
  c = new RoxyConnector(store.getSetting<RoxyConfig>("roxy")!);
const profileId = process.argv[2];
const a = store.listAccounts().find((a) => a.profileId === profileId)!;
if (!a) throw new Error("Extract account first");
const lease = store.lease(a.id, true);
if (!lease) throw new Error("Account busy");
const browser = await chromium.connectOverCDP(await c.endpoint(profileId));
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().includes("/search"));
if (!page) throw new Error("No existing search tab");
const templates: Record<string, RequestTemplate> = {};
const pending: Promise<void>[] = [];
let clicked = false;
const listener = (r: any) => {
  const u = new URL(r.url());
  if (u.hostname !== "www.tiktok.com" || !u.pathname.startsWith("/api/"))
    return;
  pending.push(
    (async () => {
      try {
        const body = await r.text(),
          headers = await r.request().allHeaders();
        const operation =
          u.pathname === "/api/comment/list/"
            ? "video.comments"
            : u.pathname === "/api/item/detail/"
              ? "video.detail"
              : null;
        if (!operation) return;
        store.evidence(
          a.id,
          "capture",
          `${operation} · HTTP ${r.status()} · ${body.length} bytes`,
          { url: r.url(), headers, response: body, status: r.status() },
        );
        templates[operation] = {
          url: r.url(),
          headers,
          capturedAt: Date.now(),
        };
        let j: any;
        try {
          j = JSON.parse(body);
        } catch {}
        console.log(
          JSON.stringify({
            path: u.pathname,
            status: r.status(),
            bytes: body.length,
            code: j?.status_code,
            comments: j?.comments?.length,
            params: [...u.searchParams.keys()],
          }),
        );
      } catch {}
    })(),
  );
};
const renew = setInterval(() => store.renew(a.id, lease), 15000);
try {
  console.log(
    "Snapshot inspected",
    (await page.locator("body").ariaSnapshot()).length,
  );
  const link = page.locator('a[href*="/video/"]').first();
  const href = await link.getAttribute("href");
  console.log("Observed video", href);
  page.on("response", listener);
  await link.click();
  clicked = true;
  await page.waitForTimeout(12000);
  console.log(
    "Page state",
    JSON.stringify({
      title: await page.title(),
      url: page.url().split("?")[0],
      text: (await page.locator("body").innerText()).slice(-1800),
    }),
  );
  await Promise.allSettled(pending);
  const s = store.getSecret(a.id);
  s.research = {
    requestTemplates: { ...s.research?.requestTemplates, ...templates },
  };
  store.saveSecret(a.id, a.version, s, lease);
} finally {
  page.off("response", listener);
  if (clicked)
    await page
      .goBack({ waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => {});
  await browser.close();
  clearInterval(renew);
  store.release(a.id, lease);
  store.close();
}
