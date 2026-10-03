import { accountIntervalMs } from '@datalom/shared/runtime/config';
import { expect, it, vi } from 'vitest';
import { fixture } from './helpers.ts';

it('honors zero spacing instead of clamping to the default', async () => {
  vi.stubEnv('DATALOM_ACCOUNT_INTERVAL_MS', '0');
  const f = await fixture();
  try {
    const lease = (await f.store.lease(f.account.id, true))!;
    await f.store.scheduleNext(f.account.id, lease);
    expect(
      Number(
        (
          await f.store.sql.client.platformAccount.findUniqueOrThrow({
            where: { id: f.account.id },
          })
        ).nextAt,
      ),
    ).toBeLessThanOrEqual(Date.now());
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});

it('persists account spacing and reserves exclusive leases', async () => {
  vi.stubEnv('DATALOM_ACCOUNT_INTERVAL_MS', '10000');
  const f = await fixture();
  try {
    await f.store.status(f.account.id, 'ready');
    expect((await f.store.accountPolicy(f.account.id)).minIntervalMs).toBe(10000);
    const lease = (await f.store.lease(f.account.id))!;
    expect(lease).toBeTruthy();
    expect(await f.store.lease(f.account.id)).toBeNull();
    await f.store.reserveRate(f.account.id, lease, 'video.detail');
    expect(await f.store.reserveRate(f.account.id, lease, 'video.detail')).toBeGreaterThan(9000);
    await f.store.scheduleNext(f.account.id, lease);
    await f.store.release(f.account.id, lease);
    expect(await f.store.lease(f.account.id)).toBeNull();
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});

it('backs off repeated rate limits and keeps disabled accounts disabled', async () => {
  const f = await fixture();
  try {
    await f.store.coolDownAccount(f.account.id, '429');
    const first = Number(
      (await f.store.sql.client.platformAccount.findUniqueOrThrow({ where: { id: f.account.id } }))
        .nextAt,
    );
    await f.store.coolDownAccount(f.account.id, '429');
    expect(
      Number(
        (
          await f.store.sql.client.platformAccount.findUniqueOrThrow({
            where: { id: f.account.id },
          })
        ).nextAt,
      ) - first,
    ).toBeGreaterThanOrEqual(60000);
    expect(await f.store.lease(f.account.id)).toBeNull();
    await f.store.patchAccount(f.account.id, { status: 'disabled' });
    await f.store.coolDownAccount(f.account.id, '429');
    expect((await f.store.getAccount(f.account.id)).status).toBe('disabled');
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});

it('stores proxy check results as readable JSON without persisting rate strikes', async () => {
  const f = await fixture();
  try {
    await f.store.coolDownAccount(f.account.id, '429');
    await f.store.setProxyCheck(f.account.id, { available: true, marker: 'private-check' });
    const row = await f.store.sql.client.platformAccount.findUniqueOrThrow({
      where: { id: f.account.id },
    });
    expect(row).not.toHaveProperty('minIntervalMs');
    expect(row).not.toHaveProperty('reason');
    expect(row).not.toHaveProperty('proxyCheck');
    expect(
      (await f.store.sql.client.proxy.findUniqueOrThrow({ where: { id: row.proxyId! } }))
        .checkResult,
    ).toEqual({ available: true, marker: 'private-check' });
    expect(await f.store.getProxyCheck(f.account.id)).toEqual({
      available: true,
      marker: 'private-check',
    });

    expect(await f.store.getAccount(f.account.id)).not.toHaveProperty('proxyCheck');
    expect(await f.store.getAccount(f.account.id)).not.toHaveProperty('rateStrikes');
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});

it('enforces concurrent API quotas independently per scope and resets the next bucket', async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => f.store.consumeRate('public-api-rate:a', 10, 3)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await f.store.consumeRate('public-api-rate:b', 10, 3)).toBe(true);
    expect(await f.store.consumeRate('public-api-rate:a', 11, 3)).toBe(true);
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});

it('rejects invalid global interval configuration and leaves account rows free of scheduling columns', async () => {
  for (const value of ['-1', '1.5', 'invalid', '', '3600001']) {
    vi.stubEnv('DATALOM_ACCOUNT_INTERVAL_MS', value);
    expect(() => accountIntervalMs()).toThrow();
  }
  vi.unstubAllEnvs();
  const f = await fixture();
  try {
    const row = await f.store.sql.client.platformAccount.findUniqueOrThrow({
      where: { id: f.account.id },
    });
    for (const field of [
      'label',
      'notes',
      'reason',
      'minIntervalMs',
      'rateStrikes',
      'lease',
      'leaseUntil',
      'nextAllowedAt',
    ])
      expect(row).not.toHaveProperty(field);
    const leases = await Promise.all(
      Array.from({ length: 12 }, () => f.store.lease(f.account.id, true)),
    );
    expect(leases.filter(Boolean)).toHaveLength(1);
    const session = await f.store.sql.client.platformAccount.findUniqueOrThrow({
      where: { id: f.account.id },
    });
    expect(session.lease).toBe(leases.find(Boolean));
    await f.store.status(f.account.id, 'ready', 'fixture status detail');
    const events = await f.store.diagnostics.find(
      (row) => row.id === f.account.id && row.stage === 'account-status',
    );
    expect(await f.store.diagnostics.rawEvent(events[0].id)).toEqual({
      reason: 'fixture status detail',
    });
  } finally {
    await f.cleanup();
    vi.unstubAllEnvs();
  }
});
