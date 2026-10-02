import { expect, it } from 'vitest';
import { fixture } from './helpers.ts';

it('honors zero spacing instead of clamping to the default', () => {
  const f = fixture();
  try {
    f.store.setAccountPolicy(f.account.id, 0);
    const lease = f.store.lease(f.account.id, true)!;
    f.store.scheduleNext(f.account.id, lease);
    expect(f.store.getAccount(f.account.id).nextAllowedAt).toBeLessThanOrEqual(Date.now());
  } finally {
    f.cleanup();
  }
});

it('persists account spacing and reserves exclusive leases', () => {
  const f = fixture();
  try {
    f.store.status(f.account.id, 'ready');
    f.store.setAccountPolicy(f.account.id, 10000);
    expect(f.store.accountPolicy(f.account.id).minIntervalMs).toBe(10000);
    expect(() => f.store.setAccountPolicy(f.account.id, -1)).toThrow();
    const lease = f.store.lease(f.account.id)!;
    expect(lease).toBeTruthy();
    expect(f.store.lease(f.account.id)).toBeNull();
    f.store.reserveRate(f.account.id, lease, 'video.detail');
    expect(f.store.getAccount(f.account.id).nextAllowedAt).toBeGreaterThan(Date.now() + 9000);
    f.store.release(f.account.id, lease);
    expect(f.store.lease(f.account.id)).toBeNull();
  } finally {
    f.cleanup();
  }
});

it('backs off repeated rate limits and keeps disabled accounts disabled', () => {
  const f = fixture();
  try {
    f.store.coolDownAccount(f.account.id, '429');
    const first = f.store.getAccount(f.account.id).nextAllowedAt;
    f.store.coolDownAccount(f.account.id, '429');
    expect(f.store.getAccount(f.account.id).nextAllowedAt - first).toBeGreaterThanOrEqual(60000);
    expect(f.store.lease(f.account.id)).toBeNull();
    f.store.patchAccount(f.account.id, { status: 'disabled' });
    f.store.coolDownAccount(f.account.id, '429');
    expect(f.store.getAccount(f.account.id).status).toBe('disabled');
  } finally {
    f.cleanup();
  }
});
