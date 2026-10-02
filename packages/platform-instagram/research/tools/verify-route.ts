import { chromium } from "playwright";
import { Impit } from "impit";
import { isIP } from "node:net";
import { openStore } from "@datalom/shared/storage/runtime";
import { startRoute } from "@datalom/network-node/route";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import { profileConnection } from "../src/connection.ts";
import { InstagramSessions } from "@datalom/platform-instagram/session";
const store = openStore(),
  sessions = new InstagramSessions(store),
  profileId = process.argv[2];
let held: ReturnType<InstagramSessions["acquire"]> | undefined,
  browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined,
  route: Awaited<ReturnType<typeof startRoute>> | undefined;
try {
  held = sessions.acquire(profileId);
  const { endpoint } = await profileConnection(store, profileId);
  browser = await chromium.connectOverCDP(endpoint);
  const page = await browser.contexts()[0].newPage();
  let browserIp: string;
  try {
    const response = await page.goto("https://api.ipify.org?format=json", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!response?.ok()) throw Error("Browser egress probe failed");
    browserIp = (await response.json()).ip;
    if (!isIP(browserIp)) throw Error("Invalid browser IP");
  } finally {
    await page.close();
  }
  route = await startRoute(
    held.session.route,
    store.dir,
    (stage, outcome, payload) => {
      store.diagnostics.event({}, `instagram-route-${stage}`, outcome, {
        profileId,
        payload,
      });
    },
  );
  const client = new Impit({
    browser: "chrome151",
    proxyUrl: route.url,
    http3: false,
    followRedirects: false,
    vanillaFallback: false,
    timeout: 25000,
  });
  const r = await client.fetch("https://api.ipify.org?format=json");
  const j = (await r.json()) as any;
  if (r.status !== 200 || !isIP(j.ip))
    throw Error("Independent egress probe failed");
  const match = j.ip === browserIp;
  const evidenceId = store.diagnostics.event(
    {},
    "instagram-route",
    "compared",
    {
      profileId,
      browserIp,
      independentIp: j.ip,
      match,
      route: held.session.route,
    },
  );
  if (!match) throw Error("Browser and independent egress differ");
  held.session.route!.verifiedAt = Date.now();
  held.session.route!.observedIp = j.ip;
  sessions.save(held.session, held.version, held.lease);
  console.log({ routeVerified: true, egressMatches: true, evidenceId });
} catch (error) {
  console.log({
    routeVerified: false,
    evidenceId: store.diagnostics.event({}, "instagram-route", "failed", {
      profileId,
      error: errorRecord(error),
    }),
  });
  process.exitCode = 1;
} finally {
  await route?.stop();
  await browser?.close();
  if (held) sessions.release(profileId, held.lease);
  store.close();
}
