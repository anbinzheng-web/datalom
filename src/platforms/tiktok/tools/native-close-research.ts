import { openStore } from "../../../core/runtime.ts";
import { errorRecord } from "../../../core/diagnostics.ts";
import { setTimeout as delay } from "node:timers/promises";
import type { RoxyConfig } from "../research/roxy.ts";
const store = openStore();
try {
  const config = store.getSetting<RoxyConfig>("roxy")!;
  const account = store.listAccounts().find((a) => a.label === process.argv[2]);
  if (!account) throw Error("Unknown research account");
  const headers = {
    "Content-Type": "application/json",
    ...(config.apiKey ? { apikey: config.apiKey } : {}),
  };
  const r = await fetch(new URL("/browser/close", config.host), {
    method: "POST",
    headers,
    body: JSON.stringify({
      workspaceId: config.workspaceId,
      dirId: account.profileId,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json()) as any;
  store.diagnostics.event(
    { accountId: account.id },
    "native-research-close",
    "observed",
    { status: r.status, response: j },
  );
  if (!r.ok || j.code !== 0) throw Error("Profile close rejected");
  await delay(1200);
  const u = new URL("/browser/connection_info", config.host);
  u.searchParams.set("workspaceId", config.workspaceId);
  const response = await fetch(u, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const info = (await response.json()) as any;
  if (!response.ok || info.code !== 0 || !Array.isArray(info.data))
    throw Error("Cannot prove browser state");
  const profiles = store
    .listAccounts()
    .filter((a) => ["TikTok1", "TikTok10"].includes(a.label));
  const closed = profiles.every(
    (a) => !info.data.some((p: any) => p.dirId === a.profileId),
  );
  const evidenceId = store.diagnostics.event(
    { accountId: account.id },
    "native-browser-state",
    "verified",
    {
      checkedAt: Date.now(),
      profiles: profiles.map((a) => a.profileId),
      profilesClosed: closed,
      connections: info.data.map((p: any) => p.dirId),
    },
  );
  if (!closed) throw Error("Research profile is still open");
  console.log({ profilesClosed: closed, evidenceId });
} catch (error) {
  const evidenceId = store.diagnostics.event(
    {},
    "native-research-close",
    "failed",
    { error: errorRecord(error) },
  );
  console.error({ status: "failed", evidenceId });
  process.exitCode = 1;
} finally {
  store.close();
}
