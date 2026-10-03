import { randomUUID } from 'node:crypto';
import { DatalomError } from '../runtime/contracts.ts';
import type { Database } from './database.ts';
import type { WalletTransaction } from './generated/client.ts';

const MAX_INT64 = 9223372036854775807n;
function integer(value: bigint, name: string, positive = false) {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > MAX_INT64)
    throw new DatalomError('INVALID_INPUT', `${name} 必须为有效的整数最小单位`);
}
function reference(value: string) {
  if (!value.trim() || value.length > 200)
    throw new DatalomError('INVALID_INPUT', '结算标识不能为空且不能超过 200 字符');
}
export function usageDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new DatalomError('INVALID_INPUT', '日期必须为有效的 YYYY-MM-DD');
  return date;
}
/** Rolling calendar year, including the cutoff day. Feb 29 clamps to Feb 28. */
export function usageCutoff(now = new Date()): Date {
  const year = now.getUTCFullYear() - 1;
  const month = now.getUTCMonth();
  const day = Math.min(now.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day));
}

/** Internal persistence only. No payment verification, pricing or per-request charging. */
export class Wallets {
  constructor(private db: Database) {}

  async get(userId: string) {
    return this.db.client.wallet.findUnique({ where: { userId } });
  }
  private async ensure(userId: string, now: number) {
    await this.db.execute(
      'INSERT INTO wallets("userId","createdAt","updatedAt") VALUES ($1,$2,$3) ON CONFLICT ("userId") DO NOTHING',
      userId,
      now,
      now,
    );
  }
  private async replay(type: string, key: string, matches: (row: WalletTransaction) => boolean) {
    // Lock only this idempotency key, never all users or all transactions.
    await this.db.lock(JSON.stringify(['wallet-reference', type, key]));
    const old = await this.db.client.walletTransaction.findUnique({
      where: { type_reference: { type, reference: key } },
    });
    if (old && !matches(old)) throw new DatalomError('CONFLICT', '结算标识已用于不同的资金操作');
    return old;
  }

  async credit(input: { userId: string; reference: string; amountMicros: bigint }) {
    reference(input.reference);
    integer(input.amountMicros, '充值金额', true);
    return this.db.transaction(async () => {
      const old = await this.replay(
        'topup',
        input.reference,
        (row) => row.userId === input.userId && row.amountMicros === input.amountMicros,
      );
      if (old) return old;
      const now = Date.now();
      await this.ensure(input.userId, now);
      const wallet = await this.db.client.wallet.update({
        where: { userId: input.userId },
        data: { balanceMicros: { increment: input.amountMicros }, updatedAt: now },
      });
      return this.db.client.walletTransaction.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          type: 'topup',
          reference: input.reference,
          amountMicros: input.amountMicros,
          balanceAfterMicros: wallet.balanceMicros,
          createdAt: now,
        },
      });
    });
  }

  async settle(input: {
    userId: string;
    apiKeyId: string;
    reference: string;
    date: string;
    calls: bigint;
    failedCalls: bigint;
    costMicros: bigint;
  }) {
    reference(input.reference);
    integer(input.calls, '调用数', true);
    integer(input.failedCalls, '失败调用数');
    integer(input.costMicros, '调用费用');
    if (input.failedCalls > input.calls)
      throw new DatalomError('INVALID_INPUT', '失败数不能超过调用数');
    const day = usageDate(input.date);
    return this.db.transaction(async () => {
      const old = await this.replay(
        'usage',
        input.reference,
        (row) =>
          row.userId === input.userId &&
          row.apiKeyId === input.apiKeyId &&
          row.usageDate?.getTime() === day.getTime() &&
          row.calls === input.calls &&
          row.failedCalls === input.failedCalls &&
          row.amountMicros === -input.costMicros,
      );
      if (old) return old;
      const now = new Date();
      if (day < usageCutoff(now) || day > usageDate(now.toISOString().slice(0, 10)))
        throw new DatalomError('INVALID_INPUT', '仅接收最近 12 个月内的调用结算');
      const key = await this.db.client.userApiKey.findUnique({ where: { id: input.apiKeyId } });
      if (!key || key.userId !== input.userId)
        throw new DatalomError('INVALID_INPUT', 'API Key 不属于该用户');
      // Revoked keys may still have legitimate, delayed settlement batches.
      await this.ensure(input.userId, now.getTime());
      const changed = await this.db.client.wallet.updateMany({
        where: { userId: input.userId, balanceMicros: { gte: input.costMicros } },
        data: { balanceMicros: { decrement: input.costMicros }, updatedAt: now.getTime() },
      });
      if (changed.count !== 1) throw new DatalomError('CONFLICT', '钱包余额不足');
      const wallet = await this.db.client.wallet.findUniqueOrThrow({
        where: { userId: input.userId },
      });
      const transaction = await this.db.client.walletTransaction.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          type: 'usage',
          reference: input.reference,
          apiKeyId: input.apiKeyId,
          usageDate: day,
          calls: input.calls,
          failedCalls: input.failedCalls,
          amountMicros: -input.costMicros,
          balanceAfterMicros: wallet.balanceMicros,
          createdAt: now.getTime(),
        },
      });
      await this.db.client.apiUsageDaily.upsert({
        where: {
          userId_usageDate_apiKeyId: {
            userId: input.userId,
            usageDate: day,
            apiKeyId: input.apiKeyId,
          },
        },
        create: {
          userId: input.userId,
          apiKeyId: input.apiKeyId,
          usageDate: day,
          calls: input.calls,
          failedCalls: input.failedCalls,
          costMicros: input.costMicros,
          updatedAt: now.getTime(),
        },
        update: {
          calls: { increment: input.calls },
          failedCalls: { increment: input.failedCalls },
          costMicros: { increment: input.costMicros },
          updatedAt: now.getTime(),
        },
      });
      return transaction;
    });
  }

  async daily(
    input: { userId: string; apiKeyId?: string; from?: string; to?: string },
    now = new Date(),
  ) {
    const cutoff = usageCutoff(now),
      today = usageDate(now.toISOString().slice(0, 10));
    const from = input.from ? usageDate(input.from) : cutoff;
    const to = input.to ? usageDate(input.to) : today;
    if (from > to) throw new DatalomError('INVALID_INPUT', '开始日期不能晚于结束日期');
    // Caller provides authenticated userId; a Key filter never removes the user boundary.
    const rows = await this.db.client.apiUsageDaily.groupBy({
      by: ['usageDate'],
      where: {
        userId: input.userId,
        ...(input.apiKeyId ? { apiKeyId: input.apiKeyId } : {}),
        usageDate: { gte: from < cutoff ? cutoff : from, lte: to > today ? today : to },
      },
      _sum: { calls: true, failedCalls: true, costMicros: true },
      orderBy: { usageDate: 'asc' },
    });
    return rows.map((row) => ({
      date: row.usageDate.toISOString().slice(0, 10),
      calls: (row._sum.calls ?? 0n).toString(),
      failedCalls: (row._sum.failedCalls ?? 0n).toString(),
      costMicros: (row._sum.costMicros ?? 0n).toString(),
    }));
  }

  async pruneUsage(now = new Date(), batchSize = 1000): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10000)
      throw new DatalomError('INVALID_INPUT', '清理批次大小必须在 1 至 10000 之间');
    // Skip rows another maintenance process is deleting. Never locks wallet balances.
    const changed = await this.db.execute(
      `
      WITH expired AS (
        SELECT "userId", "usageDate", "apiKeyId" FROM api_usage_daily
        WHERE "usageDate" < $1::date ORDER BY "usageDate" LIMIT $2 FOR UPDATE SKIP LOCKED
      )
      DELETE FROM api_usage_daily d USING expired e
      WHERE d."userId"=e."userId" AND d."usageDate"=e."usageDate" AND d."apiKeyId"=e."apiKeyId"`,
      usageCutoff(now).toISOString().slice(0, 10),
      batchSize,
    );
    return changed.changes;
  }
}
