import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Vault } from '@datalom/shared/storage/crypto';
import { Database } from '@datalom/shared/storage/database';
import { Store } from '@datalom/shared/storage/store';
import { fixture, session } from './helpers.ts';
describe('encrypted account lifecycle', () => {
  it('authenticates both ciphertext and record identity', () => {
    const v = new Vault(randomBytes(32)),
      c = v.seal({ secret: 'value' }, 'a');
    expect(v.open(c, 'a')).toEqual({ secret: 'value' });
    expect(() => v.open(c, 'b')).toThrow();
    expect(() => new Vault(randomBytes(32)).open(c, 'a')).toThrow();
  });
  it('does not persist plaintext credentials and restores with same key', async () => {
    const f = await fixture();
    try {
      const bytes = JSON.stringify(await f.store.sql.many('SELECT payload FROM platform_accounts'));
      expect(bytes).not.toContain('secret-cookie-fixture');
      expect(bytes).not.toContain('secret-proxy-fixture');
      expect(JSON.stringify(await f.store.listAccounts())).not.toContain('secret');
      const second = new Store(f.dir, new Vault(f.key), new Database(f.url));
      expect((await second.getSecret(f.account.id)).cookies[0].value).toBe('secret-cookie-fixture');
      await second.close();
    } finally {
      await f.cleanup();
    }
  });
  it('rejects extraction during a live lease, stale versions, and expired leases', async () => {
    const f = await fixture();
    try {
      const lease = (await f.store.lease(f.account.id, true))!;
      expect(lease).toBeTruthy();
      expect(await f.store.lease(f.account.id, true)).toBeNull();
      await expect(async () => await f.store.importAccount(f.account, session())).rejects.toThrow(
        /执行/,
      );
      await expect(
        async () => await f.store.saveSecret(f.account.id, 99, session(), lease),
      ).rejects.toThrow(/版本/);
      await f.store.sql.execute('UPDATE platform_accounts SET "leaseUntil"=0');
      await expect(
        async () => await f.store.saveSecret(f.account.id, 1, session(), lease),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  });
  it('preserves disabled status when an in-flight request finishes', async () => {
    const f = await fixture();
    try {
      await f.store.patchAccount(f.account.id, { status: 'disabled' });
      await f.store.status(f.account.id, 'ready');
      expect((await f.store.getAccount(f.account.id)).status).toBe('disabled');
      expect(await f.store.lease(f.account.id, true)).toBeNull();
    } finally {
      await f.cleanup();
    }
  });
});
