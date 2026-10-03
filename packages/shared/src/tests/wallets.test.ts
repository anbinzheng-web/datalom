import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture } from '../../../../scripts/checks/helpers.ts';
import { Database } from '../storage/database.ts';
import { Wallets, usageCutoff, usageDate } from '../storage/wallets.ts';

const today = () => new Date().toISOString().slice(0, 10);
async function setup() {
  const f = await fixture();
  const user = await f.store.sql.client.user.findUniqueOrThrow({
    where: { email: 'admin@datalom.com' },
  });
  const keys = await Promise.all(
    ['first', 'second'].map((name) =>
      f.store.sql.client.userApiKey.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          name,
          keyHash: randomUUID(),
          keyPrefix: 'dl_',
          keyLast4: 'test',
          createdAt: Date.now(),
        },
      }),
    ),
  );
  return { ...f, user, keys, wallet: f.store.wallets };
}

it('credits exactly once across connections and rejects reused payment references with different amounts', async () => {
  const f = await setup(),
    db = new Database(f.url),
    second = new Wallets(db);
  try {
    const input = { userId: f.user.id, reference: 'payment:provider:1', amountMicros: 1000000n };
    const receipts = await Promise.all(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? second : f.wallet).credit(input)),
    );
    expect(new Set(receipts.map((row) => row.id)).size).toBe(1);
    expect((await f.wallet.get(f.user.id))?.balanceMicros).toBe(1000000n);
    await expect(f.wallet.credit({ ...input, amountMicros: 2000000n })).rejects.toThrow('结算标识');
    expect(await f.store.sql.client.walletTransaction.count()).toBe(1);
    await expect(
      f.wallet.credit({ ...input, reference: 'invalid', amountMicros: 0n }),
    ).rejects.toThrow();
  } finally {
    await db.close();
    await f.cleanup();
  }
});

it('serializes only a user balance, never overspends and atomically aggregates competing batches', async () => {
  const f = await setup(),
    db = new Database(f.url),
    second = new Wallets(db);
  try {
    await f.wallet.credit({ userId: f.user.id, reference: 'fund', amountMicros: 100n });
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? second : f.wallet).settle({
          userId: f.user.id,
          apiKeyId: f.keys[0].id,
          reference: `batch:${i}`,
          date: today(),
          calls: 10n,
          failedCalls: 2n,
          costMicros: 20n,
        }),
      ),
    );
    expect(attempts.filter((row) => row.status === 'fulfilled')).toHaveLength(5);
    expect((await f.wallet.get(f.user.id))?.balanceMicros).toBe(0n);
    expect(await f.store.sql.client.walletTransaction.count({ where: { type: 'usage' } })).toBe(5);
    expect(await f.wallet.daily({ userId: f.user.id })).toEqual([
      { date: today(), calls: '50', failedCalls: '10', costMicros: '100' },
    ]);
    const receipt = attempts.find((row) => row.status === 'fulfilled');
    if (receipt?.status !== 'fulfilled') throw new Error('Expected settlement');
    const replay = await second.settle({
      userId: f.user.id,
      apiKeyId: f.keys[0].id,
      reference: receipt.value.reference,
      date: today(),
      calls: 10n,
      failedCalls: 2n,
      costMicros: 20n,
    });
    expect(replay.id).toBe(receipt.value.id);
    expect((await f.wallet.daily({ userId: f.user.id }))[0].costMicros).toBe('100');
  } finally {
    await db.close();
    await f.cleanup();
  }
});

it('queries by day and API Key without mixing users and preserves bigint monetary precision', async () => {
  const f = await setup();
  try {
    const amount = 9007199254740993n;
    await f.wallet.credit({
      userId: f.user.id,
      reference: 'large-fund',
      amountMicros: amount + 10n,
    });
    await f.wallet.settle({
      userId: f.user.id,
      apiKeyId: f.keys[0].id,
      reference: 'large-batch',
      date: today(),
      calls: 2n,
      failedCalls: 1n,
      costMicros: amount,
    });
    await f.wallet.settle({
      userId: f.user.id,
      apiKeyId: f.keys[1].id,
      reference: 'small-batch',
      date: today(),
      calls: 3n,
      failedCalls: 0n,
      costMicros: 10n,
    });
    expect((await f.wallet.daily({ userId: f.user.id }))[0]).toMatchObject({
      calls: '5',
      costMicros: (amount + 10n).toString(),
    });
    expect(
      (await f.wallet.daily({ userId: f.user.id, apiKeyId: f.keys[0].id }))[0].costMicros,
    ).toBe(amount.toString());
    expect(await f.wallet.daily({ userId: 'different-user', apiKeyId: f.keys[0].id })).toEqual([]);
    await f.store.sql.client.userApiKey.update({
      where: { id: f.keys[0].id },
      data: { name: 'renamed', revokedAt: Date.now() },
    });
    expect((await f.wallet.daily({ userId: f.user.id, apiKeyId: f.keys[0].id }))[0].calls).toBe(
      '2',
    );
    await expect(
      f.store.sql.client.userApiKey.delete({ where: { id: f.keys[0].id } }),
    ).rejects.toThrow();
    await expect(f.store.sql.client.user.delete({ where: { id: f.user.id } })).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});

it('rolls back balance and ledger when daily aggregation cannot be committed', async () => {
  const f = await setup();
  try {
    await f.wallet.credit({ userId: f.user.id, reference: 'fund', amountMicros: 100n });
    await f.store.sql.client.apiUsageDaily.create({
      data: {
        userId: f.user.id,
        apiKeyId: f.keys[0].id,
        usageDate: usageDate(today()),
        calls: 9223372036854775807n,
        updatedAt: Date.now(),
      },
    });
    await expect(
      f.wallet.settle({
        userId: f.user.id,
        apiKeyId: f.keys[0].id,
        reference: 'overflow',
        date: today(),
        calls: 1n,
        failedCalls: 0n,
        costMicros: 20n,
      }),
    ).rejects.toThrow();
    expect((await f.wallet.get(f.user.id))?.balanceMicros).toBe(100n);
    expect(await f.store.sql.client.walletTransaction.count({ where: { type: 'usage' } })).toBe(0);
  } finally {
    await f.cleanup();
  }
});

it('rejects another user Key and invalid money or call counts without creating financial records', async () => {
  const f = await setup();
  try {
    const base = {
      userId: f.user.id,
      apiKeyId: f.keys[0].id,
      reference: 'invalid',
      date: today(),
      calls: 1n,
      failedCalls: 0n,
      costMicros: 0n,
    };
    await expect(f.wallet.settle({ ...base, userId: 'other-user' })).rejects.toThrow('不属于');
    await expect(f.wallet.settle({ ...base, failedCalls: 2n })).rejects.toThrow();
    await expect(f.wallet.settle({ ...base, costMicros: -1n })).rejects.toThrow();
    await expect(f.wallet.settle({ ...base, date: '2025-02-30' })).rejects.toThrow();
    await expect(f.wallet.settle({ ...base, date: '2020-01-01' })).rejects.toThrow('12 个月');
    await expect(f.wallet.settle({ ...base, date: '2099-01-01' })).rejects.toThrow('12 个月');
    expect(await f.wallet.get(f.user.id)).toBeNull();
    await f.wallet.settle({ ...base, reference: 'free-usage' });
    expect((await f.wallet.daily({ userId: f.user.id }))[0].costMicros).toBe('0');
    await expect(
      f.store.sql.client.apiUsageDaily.updateMany({ data: { costMicros: -1n } }),
    ).rejects.toThrow();
    await expect(
      f.store.sql.client.wallet.update({
        where: { userId: f.user.id },
        data: { balanceMicros: -1n },
      }),
    ).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});

it('retains the cutoff day, prunes in bounded batches and never deletes wallet history', async () => {
  const f = await setup();
  try {
    await f.wallet.credit({ userId: f.user.id, reference: 'fund', amountMicros: 100n });
    for (const day of ['2025-03-29', '2025-03-30', '2025-03-31', '2026-03-31'])
      await f.store.sql.client.apiUsageDaily.create({
        data: {
          userId: f.user.id,
          apiKeyId: f.keys[0].id,
          usageDate: usageDate(day),
          calls: 1n,
          costMicros: 1n,
          updatedAt: Date.now(),
        },
      });
    const now = new Date('2026-03-31T23:59:00Z');
    expect(
      (await f.wallet.daily({ userId: f.user.id, from: '2020-01-01' }, now)).map((row) => row.date),
    ).toEqual(['2025-03-31', '2026-03-31']);
    expect(await f.wallet.pruneUsage(now, 1)).toBe(1);
    expect(await f.wallet.pruneUsage(now, 1)).toBe(1);
    expect(await f.wallet.pruneUsage(now, 1)).toBe(0);
    expect(await f.store.sql.client.apiUsageDaily.count()).toBe(2);
    expect(await f.store.sql.client.walletTransaction.count()).toBe(1);
    expect((await f.wallet.get(f.user.id))?.balanceMicros).toBe(100n);
  } finally {
    await f.cleanup();
  }
});

it('uses calendar months with leap-year clamping', () => {
  expect(usageCutoff(new Date('2024-02-29T18:00:00Z')).toISOString()).toBe(
    '2023-02-28T00:00:00.000Z',
  );
  expect(usageCutoff(new Date('2025-03-31T00:00:00Z')).toISOString()).toBe(
    '2024-03-31T00:00:00.000Z',
  );
});
