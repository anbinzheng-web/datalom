import { SpiderError } from "../../../core/contracts.ts";
import type { Store } from "../../../core/store.ts";
interface RoxySettings { host: string; workspaceId: string; apiKey?: string; upstream?: unknown }
export async function profileConnection(store: Store, profileId: string) {
  if (!/^[a-f0-9]{32}$/.test(profileId)) throw new SpiderError("INVALID_INPUT", "需要明确的 Profile ID");
  const config = store.getSetting<RoxySettings>("roxy");
  if (!config) throw new SpiderError("INVALID_INPUT", "尚未配置 RoxyBrowser");
  const base = new URL(config.host);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol)) throw new SpiderError("INVALID_INPUT", "Roxy 必须为本机服务");
  const query = new URL("/browser/connection_info", base);
  query.searchParams.set("workspaceId", config.workspaceId);
  query.searchParams.set("dirIds", profileId);
  const r = await fetch(query, { headers: config.apiKey ? { apikey: config.apiKey } : {}, signal: AbortSignal.timeout(15000), redirect: "error" });
  const j = await r.json() as any;
  if (!r.ok || j.code !== 0 || !Array.isArray(j.data)) throw new SpiderError("INVALID_INPUT", "读取 Roxy 连接状态失败");
  const row = j.data.find((x: any) => x.dirId === profileId);
  if (!row?.ws) throw new SpiderError("INVALID_INPUT", "指定 Profile 未运行");
  const endpoint = new URL(row.ws);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) || !["ws:", "wss:"].includes(endpoint.protocol)) throw new SpiderError("INVALID_INPUT", "CDP 必须为本机连接");
  return { endpoint: endpoint.toString(), config };
}
