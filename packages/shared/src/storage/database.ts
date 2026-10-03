import { userInfo } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from './generated/client.ts';

/** PostgreSQL persistence. SQL arguments are bound by Prisma, never interpolated. */
export class Database {
  private context = new AsyncLocalStorage<Prisma.TransactionClient>();
  private root: PrismaClient;
  constructor(
    url = process.env.DATABASE_URL ??
      `postgresql://${encodeURIComponent(userInfo().username)}@localhost:5432/datalom`,
  ) {
    const schema = new URL(url).searchParams.get('schema') ?? 'public';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid database schema');
    this.root = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url, options: `-c search_path=${schema}` },
        { schema },
      ),
    });
  }
  get client() {
    return this.context.getStore() ?? this.root;
  }
  async many<T = any>(query: string, ...values: unknown[]): Promise<T[]> {
    return numbers(
      await this.client.$queryRawUnsafe(query, ...values.map((v) => (v === undefined ? null : v))),
    ) as T[];
  }
  async one<T = any>(query: string, ...values: unknown[]): Promise<T | undefined> {
    return (await this.many<T>(query, ...values))[0];
  }
  async execute(query: string, ...values: unknown[]): Promise<{ changes: number }> {
    return {
      changes: await this.client.$executeRawUnsafe(
        query,
        ...values.map((v) => (v === undefined ? null : v)),
      ),
    };
  }
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return await work();
    return this.root.$transaction(
      async (tx) => {
        return this.context.run(tx, work);
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }
  async lock(key: string) {
    await this.client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
  async close() {
    await this.root.$disconnect();
  }
}

/** Epoch milliseconds remain numbers at application/API boundaries. */
export function numbers<T>(value: T): any {
  if (typeof value === 'bigint') {
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds safe JavaScript range');
    return n;
  }
  if (Array.isArray(value)) return value.map(numbers);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, numbers(v)]));
  return value;
}
