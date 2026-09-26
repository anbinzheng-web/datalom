import { cookieJar } from "@datalom/network-node/cookies";
import { signInProcess } from "@datalom/platform-tiktok/signer-process";
import { openStore } from "@datalom/storage-node/runtime";
import { openTransport } from "@datalom/worker/runner";
const store = openStore(),
  a = store.listAccounts().find((a) => a.profileId === process.argv[2]);
if (!a) throw new Error("Unknown profile");
const lease = store.lease(a.id, true);
if (!lease) throw new Error("Account busy");
const s = store.getSecret(a.id),
  template = s.research?.requestTemplates?.["video.comments"];
if (!template) throw new Error("Capture comments first");
const c = await openTransport(s, store.dir);
const mode = process.argv[3] ?? "unsigned";
try {
  const url = new URL(template.url);
  if (mode.startsWith("unsigned"))
    for (const name of ["X-Bogus", "X-Gnarly", "X-Dynosaur", "_signature"])
      url.searchParams.delete(name);
  if (process.argv[4]) url.searchParams.set("cursor", process.argv[4]);
  const signed = mode.startsWith("fresh")
    ? await signInProcess(
        {
          templateUrl: template.url,
          userAgent: s.observed.userAgent,
          updates: { cursor: process.argv[4] ?? "0" },
          msToken: mode.includes("token")
            ? cookieJar(s)
                .getCookiesSync(template.url)
                .find((c) => c.key === "msToken")?.value
            : undefined,
        },
        AbortSignal.timeout(5000),
      )
    : url.href;
  const t = Date.now();
  const r = await c.transport.request(signed, {
    signal: AbortSignal.timeout(25000),
    headers: {
      ...(mode.endsWith("headers")
        ? Object.fromEntries(
            Object.entries(template.headers).filter(([k]) =>
              [
                "accept",
                "accept-language",
                "priority",
                "sec-ch-ua",
                "sec-ch-ua-mobile",
                "sec-ch-ua-platform",
                "sec-fetch-dest",
                "sec-fetch-mode",
                "sec-fetch-site",
                "user-agent",
              ].includes(k),
            ),
          )
        : {}),
      referer: template.headers.referer ?? "https://www.tiktok.com/",
      accept: "*/*",
    },
  });
  let j: any;
  try {
    j = JSON.parse(r.body);
  } catch {}
  const result = {
    mode,
    status: r.status,
    bytes: r.body.length,
    code: j?.status_code,
    count: j?.comments?.length,
    cursor: j?.cursor,
    hasMore: j?.has_more,
    title: r.body.match(/<title>(.*?)<\/title>/)?.[1],
    duration: Date.now() - t,
  };
  store.evidence(
    a.id,
    "replay",
    `${mode} · HTTP ${r.status} · ${r.body.length} bytes`,
    { url: signed, result, response: r.body },
  );
  c.save();
  store.saveSecret(a.id, a.version, s, lease);
  console.log(JSON.stringify(result));
} finally {
  await c.close();
  store.release(a.id, lease);
  store.close();
}
