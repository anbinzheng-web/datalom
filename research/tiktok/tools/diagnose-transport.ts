import { signInProcess } from "@datalom/platform-tiktok/signer-process";
import { decodeGnarly } from "@datalom/platform-tiktok/signature-codec";
import { chromium, type Route } from "playwright";
import { Impit } from "impit";
import { openStore } from "@datalom/storage-node/runtime";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../src/roxy.ts";
import { startRoute } from "@datalom/network-node/route";
const store = openStore(),
  connector = new RoxyConnector(store.getSetting<RoxyConfig>("roxy")!),
  profileId = process.argv[2];
const account = store.listAccounts().find((a) => a.profileId === profileId)!;
const lease = store.lease(account.id, true);
if (!lease) throw new Error("Account busy");
const browser = await chromium.connectOverCDP(
    await connector.endpoint(profileId),
  ),
  page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("/search"))!;
const network = await startRoute(store.getSecret(account.id).route, store.dir);
let sampled = false,
  clicked = false;
const pending: Promise<void>[] = [];
const intercept = async (route: Route) => {
  if (sampled) {
    await route.continue();
    return;
  }
  sampled = true;
  const request = route.request(),
    headers = await request.allHeaders();
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([k]) =>
        !k.startsWith(":") &&
        !["host", "content-length", "connection", "accept-encoding"].includes(
          k,
        ),
    ),
  );
  try {
    const client = new Impit({
      browser: "chrome151",
      proxyUrl: network.url,
      http3: false,
      followRedirects: false,
      timeout: 20000,
    });
    const start = Date.now();
    const signed =
      process.argv[3] === "fresh"
        ? await signInProcess(
            {
              templateUrl: request.url(),
              userAgent: headers["user-agent"],
              updates: {},
              counter: 0,
              now:
                Number(
                  decodeGnarly(
                    new URL(request.url()).searchParams.get("X-Gnarly")!,
                  )[6],
                ) * 1000,
            },
            AbortSignal.timeout(5000),
          )
        : request.url();
    const r = await client.fetch(signed, {
      headers: safeHeaders,
      signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    let j: any;
    try {
      j = JSON.parse(body);
    } catch {}
    store.evidence(
      account.id,
      "transport-diagnosis",
      `独立 HTTP 先发 · HTTP ${r.status} · ${body.length} bytes`,
      {
        url: request.url(),
        headers,
        result: body,
        responseHeaders: Object.fromEntries(r.headers),
      },
    );
    console.log({
      client:
        process.argv[3] === "fresh"
          ? "node-generated-before-browser"
          : "impit-chrome151-before-browser",
      status: r.status,
      bytes: body.length,
      code: j?.status_code,
      comments: j?.comments?.length,
      ms: Date.now() - start,
    });
  } finally {
    await route.continue();
  }
};
const listener = (r: any) => {
  if (new URL(r.url()).pathname !== "/api/comment/list/") return;
  pending.push(
    (async () => {
      try {
        const body = await r.text();
        let j: any;
        try {
          j = JSON.parse(body);
        } catch {}
        console.log({
          client: "browser-after-impit",
          status: r.status(),
          bytes: body.length,
          code: j?.status_code,
          count: j?.comments?.length,
        });
        const s = store.getSecret(account.id);
        s.research = {
          ...s.research,
          requestTemplates: {
            ...s.research?.requestTemplates,
            "video.comments": {
              url: r.url(),
              headers: await r.request().allHeaders(),
              capturedAt: Date.now(),
            },
          },
        };
        store.saveSecret(account.id, account.version, s, lease);
        store.evidence(
          account.id,
          "capture",
          `浏览器对照 · HTTP ${r.status()} · ${body.length} bytes`,
          {
            url: r.url(),
            headers: await r.request().allHeaders(),
            response: body,
            responseHeaders: await r.allHeaders(),
          },
        );
      } catch {}
    })(),
  );
};
const timer = setInterval(() => store.renew(account.id, lease), 15000);
try {
  await page.locator("body").ariaSnapshot();
  page.on("response", listener);
  await page.route("**/api/comment/list/**", intercept);
  await page.locator('a[href*="/video/"]').first().click();
  clicked = true;
  await page.waitForTimeout(28000);
  await Promise.allSettled(pending);
} finally {
  await page.unroute("**/api/comment/list/**", intercept);
  page.off("response", listener);
  if (clicked)
    await page
      .goBack({ waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => {});
  await browser.close();
  await network.stop();
  clearInterval(timer);
  store.release(account.id, lease);
  store.close();
}
