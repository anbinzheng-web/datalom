import { expect, it } from 'vitest';
import { fixture } from '../../../../scripts/checks/helpers.ts';
import { PlatformSessions } from '../storage/sessions.ts';

it('isolates session drafts from usable guests and keeps platform caches encrypted', async () => {
  const f = await fixture();
  try {
    const seeds = new PlatformSessions(f.store.sql, f.store.vault, 'doubao', 'seed');
    const guests = new PlatformSessions(f.store.sql, f.store.vault, 'doubao', 'guest');
    await seeds.replace('same', { token: 'secret-seed' });
    expect(await seeds.read('same')).toEqual({ token: 'secret-seed' });
    expect(await guests.available()).toEqual([]);
    await guests.replace('same', { token: 'secret-guest' });
    const held = await guests.acquire('same');
    await guests.release('same', held.lease, 60000);
    expect(await guests.available()).toEqual([]);
    await expect(guests.acquire('same')).rejects.toThrow('冷却');
    await f.store.setPlatformCache('doubao', 'report', { marker: 'private-report' });
    expect(await f.store.getPlatformCache('doubao', 'report')).toEqual({
      marker: 'private-report',
    });
    expect(await f.store.getPlatformCache('x', 'report')).toBeUndefined();
    const cache = await f.store.getPlatformCache('doubao', 'report');
    expect(cache).toEqual({ marker: 'private-report' });
  } finally {
    await f.cleanup();
  }
});
