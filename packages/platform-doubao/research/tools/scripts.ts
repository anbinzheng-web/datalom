import { artifactPath } from "@datalom/shared/runtime/paths";
import { openStore } from "@datalom/shared/storage/runtime";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const store = openStore(),
  runId = randomUUID();
const row = store.sql
  .prepare(
    "SELECT id FROM diagnostic_events WHERE stage='doubao-page' AND outcome='snapshot' ORDER BY seq DESC LIMIT 1",
  )
  .get() as any;
const page = store.diagnostics.rawEvent(row.id) as any;
const sources = [
  ...new Set<string>([
    ...page.dom.scripts,
    ...(page.dom.resources ?? []).map((entry: any) => entry.url),
  ]),
].filter(
  (url) =>
    new URL(url).hostname === "lf-flow-web-cdn.doubao.com" &&
    /\.js(?:\?|$)/.test(url),
);
const report: any[] = [];
const needles = [
  "710022002",
  "send_rate_limit",
  "/chat/completion",
  "get_web_anon_id",
  "is_limit",
  "limit_time",
  "from_logout",
  "agw-js-conv",
  "guest_send",
  "guest_limit",
  "GuestLimit",
  "RATE_LIMIT",
  "login_required",
];
const cached = new Map<string, any>();
for (const row of store.sql
  .prepare(
    "SELECT id FROM diagnostic_events WHERE stage='doubao-script' AND outcome='captured'",
  )
  .all() as any[]) {
  const raw = store.diagnostics.rawEvent(row.id) as any;
  cached.set(raw.url, { ...raw, evidenceId: row.id });
}
try {
  for (let offset = 0; offset < sources.length; offset += 4) {
    const batch = await Promise.allSettled(
      sources.slice(offset, offset + 4).map(async (url) => {
        let entry = cached.get(url);
        if (!entry) {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok)
            throw new Error(`script returned ${response.status}: ${url}`);
          const source = await response.text(),
            sha256 = createHash("sha256").update(source).digest("hex");
          const evidenceId = store.diagnostics.event(
            { requestId: runId },
            "doubao-script",
            "captured",
            { url, source, sha256 },
          );
          entry = { source, sha256, evidenceId };
        }
        const { source, sha256, evidenceId } = entry;
        const matches: any[] = [];
        for (const needle of needles) {
          let offset = 0,
            count = 0;
          while (
            (offset = source.indexOf(needle, offset)) >= 0 &&
            count++ < 12
          ) {
            matches.push({
              needle,
              offset,
              snippet: source.slice(Math.max(0, offset - 400), offset + 850),
            });
            offset += needle.length;
          }
        }
        report.push({ url, bytes: source.length, evidenceId, sha256, matches });
        if (matches.length)
          console.log(
            JSON.stringify({
              url: new URL(url).pathname.split("/").at(-1),
              bytes: source.length,
              evidenceId,
              needles: [...new Set(matches.map((m) => m.needle))],
            }),
          );
      }),
    );
    for (const result of batch)
      if (result.status === "rejected")
        store.diagnostics.event(
          { requestId: runId },
          "doubao-script",
          "failed",
          errorRecord(result.reason),
        );
  }
  mkdirSync(artifactPath(), { recursive: true });
  writeFileSync(
    artifactPath("doubao-scripts.json"),
    JSON.stringify({ runId, scripts: report }, null, 2),
  );
} catch (error) {
  const evidenceId = store.diagnostics.event(
    { requestId: runId },
    "doubao-script",
    "failed",
    errorRecord(error),
  );
  console.log(JSON.stringify({ evidenceId, status: "failed" }));
  process.exitCode = 1;
} finally {
  store.close();
}
