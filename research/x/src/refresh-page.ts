import { chromium } from "playwright";
import { openStore } from "@datalom/storage-node/runtime";
import { profileConnection } from "./connection.ts";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
const s = openStore();
let b;
try {
  const { endpoint } = await profileConnection(s, process.argv[2]);
  b = await chromium.connectOverCDP(endpoint);
  const p = b
    .contexts()[0]
    .pages()
    .find((p) => p.url().startsWith("https://x.com/search?"));
  if (!p) throw Error("No public search tab");
  const c = await p.context().newCDPSession(p);
  try {
    await c.send("Network.enable");
    await c.send("Network.setCacheDisabled", { cacheDisabled: true });
    await p
      .reload({ waitUntil: "networkidle", timeout: 25000 })
      .catch(() => {});
    console.log({
      scripts: await p.evaluate(() =>
        [...document.scripts]
          .map((s) => s.src)
          .filter((x) => x.includes("/main.")),
      ),
    });
  } finally {
    await c.detach();
  }
} catch (error) {
  console.log({
    failed: true,
    evidenceId: s.diagnostics.event({}, "x-cache-refresh", "failed", {
      error: errorRecord(error),
    }),
  });
  process.exitCode = 1;
} finally {
  await b?.close();
  s.close();
}
