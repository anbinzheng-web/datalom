// One-shot diagnostic for a browser query that itself returned a business error.
// Kept separate from native-run, which requires a valid source response.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { openStore } from "@datalom/storage-node/runtime";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { startRoute } from "@datalom/network-node/route";
import { FacebookSessions } from "@datalom/platform-facebook/session";
import { FacebookTransport } from "@datalom/platform-facebook/transport";
import { buildRequest, validateResult, type Capture } from "@datalom/platform-facebook/native";
const [profileId, evidenceId] = process.argv.slice(2),
  store = openStore(),
  sessions = new FacebookSessions(store),
  requestId = randomUUID();
let held: ReturnType<FacebookSessions["acquire"]> | undefined,
  route: Awaited<ReturnType<typeof startRoute>> | undefined;
const report: any = {
  requestId,
  profileId,
  sourceEvidenceId: evidenceId,
  operation: "marketplace.search",
  browserUsed: false,
  diagnosticOnly: true,
};
const trace = (stage: string, outcome: string, payload?: unknown) => {
  store.diagnostics.event(
    { requestId, accountId: profileId },
    stage,
    outcome,
    payload,
  );
};
try {
  const meta = store.sql
    .prepare("SELECT stage,outcome FROM diagnostic_events WHERE id=?")
    .get(evidenceId) as any;
  if (meta?.stage !== "facebook-http" || meta.outcome !== "received")
    throw Error("Expected browser evidence");
  const capture = store.diagnostics.rawEvent(evidenceId) as Capture;
  if (capture.profileId !== profileId) throw Error("Profile mismatch");
  const sample = buildRequest("marketplace.search", capture, {}, 1);
  try {
    validateResult(
      "marketplace.search",
      sample.variables,
      capture.status,
      capture.body,
    );
    report.browserSample = "valid";
  } catch (e) {
    report.browserSample = "failed";
    trace("search-baseline", "failed", { error: errorRecord(e) });
  }
  held = sessions.acquire(profileId);
  if (!held.session.route?.verifiedAt) throw Error("Route not verified");
  route = await startRoute(held.session.route, store.dir, trace);
  const request = buildRequest(
    "marketplace.search",
    capture,
    {},
    ++held.session.requestCounter,
  );
  sessions.save(held.session, held.version, held.lease);
  const r = await new FacebookTransport(route.url, held.session, trace).request(
    request,
    AbortSignal.timeout(30000),
  );
  sessions.save(held.session, held.version, held.lease);
  report.httpStatus = r.status;
  report.bytes = r.bytes;
  const result = validateResult(
    "marketplace.search",
    request.variables,
    r.status,
    r.body,
  );
  report.status = "succeeded";
  report.count = result.page?.items.length;
  trace("search-experiment", "validated", result);
  report.templateEvidenceId = store.diagnostics.event(
    { requestId },
    "facebook-template",
    "validated",
    {
      ...capture,
      body: r.body,
      status: r.status,
      requestBody: request.body,
      requestHeaders: request.headers,
      sourceEvidenceId: evidenceId,
      provenance: "independent-experiment",
    },
  );
} catch (error) {
  report.status = "failed";
  report.evidenceId = store.diagnostics.event(
    { requestId },
    "search-experiment",
    "failed",
    {
      error: errorRecord(error),
      nextExperiment:
        "对比已记录的 marketplace_search.feed_units 错误路径、关键词搜索和分类入口参数；需要新的页面成功对照，不能把 null 当零商品，也不自动重试。",
    },
  );
  process.exitCode = 1;
} finally {
  await route?.stop();
  if (held) sessions.release(profileId, held.lease);
  mkdirSync("artifacts/facebook", { recursive: true });
  writeFileSync(
    `artifacts/facebook/search-experiment-${requestId}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  store.close();
}
