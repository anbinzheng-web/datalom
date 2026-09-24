import { openStore } from "../../../core/runtime.ts";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const store = openStore();
const rows = store.sql
  .prepare(
    "SELECT id,requestId,stage,outcome,createdAt FROM diagnostic_events WHERE stage IN ('x-http','x-transaction-source') ORDER BY seq",
  )
  .all() as any[];
const starts = new Map<string, any>(),
  sources = new Map<string, any[]>(),
  reports: any[] = [];
for (const row of rows) {
  const p = store.diagnostics.rawEvent(row.id) as any;
  if (row.stage === "x-transaction-source" && row.outcome === "received") {
    const a = sources.get(row.requestId) ?? [];
    a.push({ ...p, evidenceId: row.id });
    sources.set(row.requestId, a);
    continue;
  }
  if (row.outcome === "started") starts.set(row.requestId, p);
  if (row.outcome !== "received") continue;
  const req = p.url ? p : starts.get(row.requestId);
  if (!req?.url?.includes("/SearchTimeline")) continue;
  const headers = req.requestHeaders ?? req.headers ?? {};
  const response = p.responseHeaders ?? p.headers ?? {};
  const id = headers["x-client-transaction-id"];
  const b = Buffer.from(id ?? "", "base64");
  const decoded = Buffer.from(b.subarray(1).map((v) => v ^ b[0]));
  const len = decoded.length - 21;
  const recognized = decoded.length === 69 && decoded.at(-1) === 3;
  const timestamp = recognized
    ? decoded.readUInt32LE(len) + 1682924400
    : undefined;
  const u = new URL(req.url),
    v = JSON.parse(u.searchParams.get("variables") ?? "{}");
  const cookies = Object.fromEntries(
    (headers.cookie ?? "")
      .split(";")
      .filter((s: string) => s.includes("="))
      .map((s: string) => {
        const i = s.indexOf("=");
        return [s.slice(0, i).trim(), s.slice(i + 1)];
      }),
  );
  const digest = (s: string) =>
    createHash("sha256").update(s).digest("hex").slice(0, 16);
  const event = {
    evidenceId: row.id,
    requestId: row.requestId,
    browserCapture: !!p.profileId,
    at: new Date(row.createdAt).toISOString(),
    queryId: u.pathname.split("/").at(-2),
    variables: {
      ...v,
      cursor: v.cursor
        ? { present: true, sha256: digest(v.cursor) }
        : undefined,
    },
    status: p.status,
    bytes: p.bytes,
    headerNames: Object.keys(headers).sort(),
    authHash: digest(headers.authorization ?? ""),
    cookieNames: Object.keys(cookies).sort(),
    authCookieHash: digest(cookies.auth_token ?? ""),
    csrfMatchesCookie: headers["x-csrf-token"] === cookies.ct0,
    transaction: {
      present: !!id,
      recognized,
      decodedLength: decoded.length,
      keyLength: len,
      keyHash:
        len > 0
          ? digest(decoded.subarray(0, len).toString("base64"))
          : undefined,
      time: timestamp ? new Date(timestamp * 1000).toISOString() : undefined,
      serverOffsetSeconds: timestamp
        ? Math.round(Date.parse(response.date) / 1000) - timestamp
        : undefined,
      finalByte: decoded.at(-1),
    },
    rate: {
      limit: response["x-rate-limit-limit"],
      remaining: response["x-rate-limit-remaining"],
      reset: response["x-rate-limit-reset"],
    },
    server: response.server,
    responseTimeMs: response["x-response-time"],
    serverTransactionId: response["x-transaction-id"],
    featureHash: digest(u.searchParams.get("features") ?? ""),
    fieldToggleHash: digest(u.searchParams.get("fieldToggles") ?? ""),
  };
  reports.push(event);
}
mkdirSync("artifacts/x", { recursive: true });
writeFileSync(
  "artifacts/x/search-audit.json",
  JSON.stringify(reports, null, 2),
);
console.log(
  reports.map((r) => ({
    id: r.evidenceId,
    requestId: r.requestId,
    browser: r.browserCapture,
    status: r.status,
    query: r.variables.rawQuery,
    product: r.variables.product,
    auth: r.authCookieHash,
    csrf: r.csrfMatchesCookie,
    transaction: r.transaction,
    rate: r.rate,
  })),
);
for (const [run, s] of sources) {
  for (const p of s)
    if (p.url?.includes("ondemand.s.62eaf35b242cc757")) {
      writeFileSync("/tmp/spider-x-ondemand.js", p.body, { mode: 0o600 });
      console.log({ scriptEvidence: p.evidenceId, bytes: p.bytes });
      break;
    }
  if (s.some((p) => p.url?.includes("ondemand.s.62eaf35b242cc757"))) break;
}
store.close();
