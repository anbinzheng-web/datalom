import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { openStore } from "@datalom/storage-node/runtime";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../src/roxy.ts";
const s = openStore(),
  c = new RoxyConnector(s.getSetting<RoxyConfig>("roxy")!),
  a = s.listAccounts().find((a) => a.profileId === process.argv[2])!;
const browser = await chromium.connectOverCDP(await c.endpoint(a.profileId));
const context = browser.contexts()[0],
  page = context.pages().find((p) => p.url().includes("www.tiktok.com"))!;
const client = await context.newCDPSession(page);
const scripts: any[] = [];
client.on("Debugger.scriptParsed", (e) => {
  if (e.url.includes("webapp-desktop") && e.url.endsWith(".js"))
    scripts.push(e);
});
try {
  await client.send("Debugger.enable");
  await new Promise((r) => setTimeout(r, 300));
  let hits = 0;
  for (const script of scripts) {
    const { scriptSource } = await client.send("Debugger.getScriptSource", {
      scriptId: script.scriptId,
    });
    const index = scriptSource.indexOf("/api/item/detail");
    if (index < 0) continue;
    const excerpt = scriptSource.slice(Math.max(0, index - 900), index + 1500);
    const digest = createHash("sha256").update(scriptSource).digest("hex");
    s.evidence(
      a.id,
      "script-analysis",
      `详情接口契约 · ${digest.slice(0, 12)}`,
      { url: script.url, digest, source: scriptSource },
    );
    console.log(JSON.stringify({ url: script.url, digest, excerpt }));
    hits++;
  }
  console.log({ scripts: scripts.length, hits });
} finally {
  await client.send("Debugger.disable");
  await client.detach();
  await browser.close();
  s.close();
}
