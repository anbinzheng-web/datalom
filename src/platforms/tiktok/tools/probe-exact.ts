import { Impit } from "impit";
import { openStore } from "../../../core/runtime.ts";
import { startRoute } from "../../../network/route.ts";
import { signInProcess } from "../signer-process.ts";
const s = openStore(),
  a = s.listAccounts().find((a) => a.profileId === process.argv[2])!,
  secret = s.getSecret(a.id),
  t = secret.research!.requestTemplates!["video.comments"];
const route = await startRoute(secret.route, s.dir);
try {
  const url = await signInProcess(
    {
      templateUrl: t.url,
      userAgent: t.headers["user-agent"],
      updates: { cursor: process.argv[3] ?? "0" },
    },
    AbortSignal.timeout(5000),
  );
  const client = new Impit({
    browser: "chrome151",
    proxyUrl: route.url,
    http3: false,
    followRedirects: false,
    timeout: 25000,
  });
  const headers = Object.fromEntries(
    Object.entries(t.headers).filter(
      ([k]) =>
        !k.startsWith(":") &&
        !["host", "content-length", "connection", "accept-encoding"].includes(
          k,
        ),
    ),
  );
  const r = await client.fetch(url, {
      headers,
      signal: AbortSignal.timeout(25000),
    }),
    body = await r.text();
  let j: any;
  try {
    j = JSON.parse(body);
  } catch {}
  const result = {
    browserUsed: false,
    signature: "node-generated",
    status: r.status,
    bytes: body.length,
    code: j?.status_code,
    comments: j?.comments?.length,
    cursor: j?.cursor,
    hasMore: j?.has_more,
  };
  s.evidence(
    a.id,
    "independent-experiment",
    "独立签名与请求 · " + body.length + " bytes",
    { result, url, body },
  );
  console.log(JSON.stringify(result));
} finally {
  await route.stop();
  s.close();
}
