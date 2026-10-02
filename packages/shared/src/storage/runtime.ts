import { dataDirectory } from "../runtime/paths.ts";
import { mkdirSync } from "node:fs";
import { Store } from "./store.ts";
import { Vault, loadMasterKey } from "./crypto.ts";
export function openStore(): Store {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return new Store(dir, new Vault(loadMasterKey(dir)));
}
