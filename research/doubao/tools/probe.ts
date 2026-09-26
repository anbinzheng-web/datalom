import { Impit } from "impit";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { openStore } from "@datalom/storage-node/runtime";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { parseDoubaoLimit } from "@datalom/platform-doubao/protocol";

// This read-only probe does not start a browser, create/rotate guest identities,
// generate chat traffic, or replay captured chat signatures.
for (const name of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
])
  delete process.env[name];
const store = openStore(),
  runId = randomUUID();
const record = (outcome: string, payload: unknown) =>
  store.diagnostics.event(
    { requestId: runId },
    "doubao-independent-limit",
    outcome,
    payload,
  );
try {
  const rows = store.sql
    .prepare(
      "SELECT id FROM diagnostic_events WHERE stage='doubao-http' AND outcome='received' ORDER BY seq DESC LIMIT 300",
    )
    .all() as any[];
  let template: any;
  for (const row of rows) {
    const value = store.diagnostics.rawEvent(row.id) as any;
    if (
      value.url &&
      new URL(value.url).pathname === "/im/message/send_rate_limit"
    ) {
      template = { ...value, evidenceId: row.id };
      break;
    }
  }
  if (!template) throw new Error("No observed rate-limit request exists");
  const url = new URL(template.url);
  if (
    url.origin !== "https://www.doubao.com" ||
    url.searchParams.has("a_bogus")
  )
    throw new Error("Unexpected endpoint contract");
  const input = JSON.parse(template.requestBody);
  input.sequence_id = randomUUID();
  const headers = Object.fromEntries(
    Object.entries(template.headers as Record<string, string>).filter(
      ([key]) =>
        !key.startsWith(":") &&
        !["host", "content-length", "accept-encoding", "x-flow-trace"].includes(
          key.toLowerCase(),
        ),
    ),
  );
  const request = {
    url: url.toString(),
    method: "POST",
    headers,
    body: JSON.stringify(input),
  };
  record("started", {
    ...request,
    browserUsed: false,
    direct: true,
    templateEvidenceId: template.evidenceId,
  });
  const client = new Impit({
    browser: "chrome151",
    proxyUrl: undefined,
    http3: false,
    followRedirects: false,
    vanillaFallback: false,
    ignoreTlsErrors: false,
    timeout: 20000,
  });
  const started = Date.now();
  const response = await client.fetch(request.url, {
    method: "POST",
    headers,
    body: request.body,
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  const evidenceId = record("received", {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body,
    durationMs: Date.now() - started,
  });
  const limit = parseDoubaoLimit(response.status, body);
  const result = {
    runId,
    evidenceId,
    date: new Date().toISOString(),
    browserUsed: false,
    direct: true,
    httpStatus: response.status,
    limit,
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/doubao-independent-limit.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const evidenceId = record("failed", errorRecord(error));
  console.log(JSON.stringify({ runId, evidenceId, status: "failed" }));
  process.exitCode = 1;
} finally {
  store.close();
}
