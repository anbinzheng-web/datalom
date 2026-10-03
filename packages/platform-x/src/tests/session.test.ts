import { it, expect } from 'vitest';
import { fixture, session } from '../../../../scripts/checks/helpers.ts';
import { Database } from '@datalom/shared/storage/database';
import { Store } from '@datalom/shared/storage/store';
import { Vault } from '@datalom/shared/storage/crypto';
import { XSessions } from '../session.ts';
it('restores encrypted X sessions and rejects concurrent extraction, stale versions and expired leases', async () => {
  const f = await fixture();
  const id = 'a'.repeat(32);
  const value = {
    ...session(),
    profileId: id,
    capturedAt: 1,
    requestCounter: 0,
  };
  try {
    const s = new XSessions(f.store);
    await s.replace(value);
    const h = await s.acquire(id);
    await expect(async () => await s.acquire(id)).rejects.toThrow();
    await expect(async () => await s.replace(value)).rejects.toThrow();
    await expect(async () => await s.save(value, h.version + 1, h.lease)).rejects.toThrow();
    h.session.requestCounter = 4;
    await s.save(h.session, h.version, h.lease);
    expect(await s.renew(id, h.lease)).toBe(false);
    await expect(async () => await s.save(value, h.version, h.lease)).rejects.toThrow();
    const second = new Store(f.dir, new Vault(f.key), new Database(f.url));
    try {
      const other = new XSessions(second);
      const live = await other.acquire(id);
      expect(live.session.requestCounter).toBe(4);
      await s.release(id, h.lease, 0);
      await expect(async () => await s.acquire(id)).rejects.toThrow();
      await other.release(id, live.lease, 5000);
      await expect(async () => await s.acquire(id)).rejects.toThrow();
    } finally {
      await second.close();
    }
  } finally {
    await f.cleanup();
  }
});

it('isolates identical profile IDs across platforms in the shared table', async () => {
  const { PlatformSessions } = await import('@datalom/shared/storage/sessions');
  const f = await fixture();
  try {
    const x = new PlatformSessions<{ marker: string }>(f.store.sql, f.store.vault, 'x', 'profile');
    const instagram = new PlatformSessions<{ marker: string }>(
      f.store.sql,
      f.store.vault,
      'instagram',
      'profile',
    );
    await x.replace('same', { marker: 'x' });
    await instagram.replace('same', { marker: 'instagram' });
    const results = await Promise.allSettled([x.acquire('same'), x.acquire('same')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const held = await instagram.acquire('same');
    expect(held.session.marker).toBe('instagram');
    await expect(x.save('same', { marker: 'wrong' }, held.lease, held.version)).rejects.toThrow();
    expect(await instagram.available()).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
