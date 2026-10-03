import { join } from 'node:path';
import { Database } from './database.ts';
import { dataDirectory } from '../runtime/paths.ts';
import { mkdirSync, existsSync } from 'node:fs';
import { Store } from './store.ts';
import { Vault, loadMasterKey } from './crypto.ts';
export async function openStore(): Promise<Store> {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const database = new Database();
  try {
    const existing = await database.one<{ present: boolean }>(`
      SELECT EXISTS(SELECT 1 FROM proxies UNION ALL SELECT 1 FROM platform_accounts UNION ALL SELECT 1 FROM users
        ) AS present`);
    const store = new Store(
      dir,
      new Vault(loadMasterKey(dir, !existing?.present && !existsSync(join(dir, 'diagnostics')))),
      database,
    );
    await store.initialize();
    return store;
  } catch (error) {
    await database.close();
    throw error;
  }
}
