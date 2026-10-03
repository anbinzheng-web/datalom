import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory } from '../runtime/paths.ts';
import { DatalomError } from '../runtime/contracts.ts';
import type { Database } from './database.ts';
import type { Vault } from './crypto.ts';

/** Local research/guest sessions. These are disposable runtime data, not credentials. */
export class PlatformSessions<T> {
  private file = join(dataDirectory(), 'platform-sessions.json');
  private values: Record<string, any> = {};
  constructor(
    private _db: Database,
    private vault: Vault,
    private platform: string,
    private namespace: 'profile' | 'guest' | 'seed' | 'research',
    private leaseMs = 60000,
  ) {
    mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  }
  private key(id: string) {
    return `${this.platform}:${this.namespace}:${id}`;
  }
  private load(): Record<string, any> {
    try {
      return this.values;
    } catch {
      return this.values;
    }
  }
  private write(values: Record<string, any>) {
    this.values = values;
    writeFileSync(this.file, JSON.stringify(values), { mode: 0o600 });
  }
  async replace(id: string, session: T, createOnly = false) {
    const values = this.load(),
      key = this.key(id),
      old = values[key];
    if (old && (createOnly || old.leaseUntil > Date.now()))
      throw new DatalomError('CONFLICT', createOnly ? '会话已存在；不会重置身份' : '会话正在使用');
    values[key] = {
      version: (old?.version ?? 0) + 1,
      payload: session,
      lease: null,
      leaseUntil: 0,
      nextAt: 0,
    };
    this.write(values);
  }
  async read(id: string): Promise<T | undefined> {
    const row = this.load()[this.key(id)];
    return row?.payload as T | undefined;
  }
  async exists(id: string) {
    return !!this.load()[this.key(id)];
  }
  async acquire(id: string) {
    const values = this.load(),
      key = this.key(id),
      row = values[key],
      now = Date.now();
    if (!row) throw new DatalomError('INVALID_INPUT', '请先提取此平台会话');
    if (row.leaseUntil > now || row.nextAt > now)
      throw new DatalomError('CONFLICT', '会话正在执行或冷却中');
    row.lease = randomUUID();
    row.leaseUntil = now + this.leaseMs;
    this.write(values);
    return {
      lease: row.lease,
      version: row.version,
      session: row.payload as T,
    };
  }
  async renew(id: string, lease: string) {
    const values = this.load(),
      row = values[this.key(id)];
    if (!row || row.lease !== lease || row.leaseUntil <= Date.now()) return false;
    row.leaseUntil = Date.now() + this.leaseMs;
    this.write(values);
    return true;
  }
  async save(id: string, session: T, lease: string, version?: number) {
    const values = this.load(),
      row = values[this.key(id)];
    if (!row || row.lease !== lease || row.version !== version || row.leaseUntil <= Date.now())
      throw new DatalomError('CONFLICT', '会话版本或租约变化');
    row.payload = session;
    this.write(values);
  }
  async release(id: string, lease: string, cooldown = 3000) {
    const values = this.load(),
      row = values[this.key(id)];
    if (row?.lease === lease) {
      row.lease = null;
      row.leaseUntil = 0;
      row.nextAt = Math.max(row.nextAt, Date.now() + cooldown);
      this.write(values);
    }
  }
  async available() {
    const now = Date.now();
    return Object.entries(this.load())
      .filter(
        ([key, row]) =>
          key.startsWith(`${this.platform}:${this.namespace}:`) &&
          row.leaseUntil <= now &&
          row.nextAt <= now,
      )
      .map(([key]) => key.split(':').slice(2).join(':'));
  }
}
