import { it, expect } from 'vitest';
import { renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '@datalom/shared/storage/store';
import { Vault, databasePath } from '@datalom/shared/storage/crypto';
import { fixture } from './helpers.ts';

it('reopens legacy database names with existing encrypted records without creating an empty replacement', () => {
  const f = fixture();
  let reopened: Store | undefined;
  try {
    f.store.sql.pragma('wal_checkpoint(TRUNCATE)');
    f.store.close();
    renameSync(join(f.dir, 'datalom.sqlite'), join(f.dir, 'spider.sqlite'));
    expect(databasePath(f.dir)).toBe(join(f.dir, 'spider.sqlite'));
    reopened = new Store(f.dir, new Vault(f.key));
    expect(reopened.getSecret(f.account.id).cookies[0].value).toBe('secret-cookie-fixture');
    expect(existsSync(join(f.dir, 'datalom.sqlite'))).toBe(false);
  } finally { reopened?.close(); f.cleanup(); }
});
