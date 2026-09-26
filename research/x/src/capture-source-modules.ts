// Read only selected public webpack factories; never invoke application modules.
import { chromium } from "playwright";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parse } from "@babel/parser";
import { generate } from "@babel/generator";
import { openStore } from "@datalom/storage-node/runtime";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { profileConnection } from "./connection.ts";
const store = openStore(),
  requestId = randomUUID();
let browser;
try {
  const { endpoint } = await profileConnection(store, process.argv[2]);
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().startsWith("https://x.com/search?"));
  if (!page) throw Error("Public search page not open");
  const rows = await page.evaluate(() => {
    const result: { id: string; source: string; chunkIds: number[] }[] = [];
    for (const chunk of (window as any).webpackChunk_twitter_responsive_web ||
      [])
      for (const id of ["995604", "316367", "991160", "447423", "147770"])
        if (chunk[1]?.[id])
          result.push({
            id,
            chunkIds: chunk[0],
            source: chunk[1][id].toString(),
          });
    return result;
  });
  mkdirSync("artifacts/x/source-analysis", { recursive: true });
  const index = [];
  for (const row of rows) {
    const sha256 = createHash("sha256").update(row.source).digest("hex");
    const evidenceId = store.diagnostics.event(
      { requestId },
      "x-public-source-module",
      "captured",
      { ...row, sha256, pageUrl: page.url() },
    );
    const path = `artifacts/x/source-analysis/module-${row.id}.js`;
    writeFileSync(
      path,
      `// Public webpack module ${row.id}; SHA256 ${sha256}\n` +
        generate(parse(`({${row.source}})`)).code +
        "\n",
    );
    index.push({
      id: row.id,
      chunkIds: row.chunkIds,
      sha256,
      evidenceId,
      path,
    });
  }
  writeFileSync(
    "artifacts/x/source-analysis/module-index.json",
    JSON.stringify({ requestId, modules: index }, null, 2),
  );
  console.log({ requestId, modules: index });
} catch (error) {
  console.log({
    failed: true,
    evidenceId: store.diagnostics.event(
      { requestId },
      "x-public-source-module",
      "failed",
      { error: errorRecord(error) },
    ),
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  store.close();
}
