import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { Store } from "./store.ts";
import { Vault, loadMasterKey } from "./crypto.ts";
export function openStore(): Store {
  const dir = resolve(process.env.SPIDER_DATA_DIR ?? ".spider");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return new Store(dir, new Vault(loadMasterKey(dir)));
}
