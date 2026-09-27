import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc } from "drizzle-orm";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { accounts, tasks } from "./schema.ts";
import { Vault, databasePath } from "./crypto.ts";
import { Diagnostics } from "./diagnostics.ts";
import {
  DatalomError,
  type Account,
  type AccountStatus,
  type SessionSecret,
  type TaskInput,
} from "@datalom/runtime-node/contracts";

export class Store {
  diagnostics: Diagnostics;
  sql: Database.Database;
  db: ReturnType<typeof drizzle>;
  constructor(
    public dir: string,
    public vault: Vault,
  ) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    this.sql = new Database(databasePath(dir));
    chmodSync(databasePath(dir), 0o600);
    this.sql.pragma("journal_mode = WAL");
    this.sql.pragma("foreign_keys = ON");
    this.sql.pragma("busy_timeout = 5000");
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, label TEXT NOT NULL, profileId TEXT NOT NULL, workspaceId TEXT NOT NULL,
      identity TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', updatedAt INTEGER NOT NULL,
      validatedAt INTEGER, nextAllowedAt INTEGER NOT NULL DEFAULT 0, secret TEXT NOT NULL, lease TEXT, leaseUntil INTEGER, UNIQUE(platform,workspaceId,profileId));
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, requestId TEXT NOT NULL UNIQUE, accountId TEXT NOT NULL REFERENCES accounts(id), status TEXT NOT NULL,
      input TEXT NOT NULL, result TEXT, error TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deadline INTEGER NOT NULL,
      pages INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0, lease TEXT);
      CREATE INDEX IF NOT EXISTS task_queue ON tasks(status,createdAt);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, accountId TEXT, kind TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS metrics (id INTEGER PRIMARY KEY, taskId TEXT, accountId TEXT NOT NULL, operation TEXT NOT NULL, code TEXT NOT NULL, durationMs INTEGER NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (scope TEXT PRIMARY KEY, nextAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, heartbeat INTEGER NOT NULL);
      PRAGMA user_version = 1;
    `);
    this.db = drizzle(this.sql);
    this.diagnostics = new Diagnostics(this.sql, this.vault, dir);
  }
  listAccounts(): Account[] {
    return this.db
      .select()
      .from(accounts)
      .orderBy(desc(accounts.updatedAt))
      .all()
      .map(({ secret, lease, leaseUntil, ...rest }) => rest as Account);
  }
  getAccount(id: string): Account {
    const row = this.listAccounts().find((x) => x.id === id);
    if (!row) throw new DatalomError("INVALID_INPUT", "账号不存在");
    return row;
  }
  getSecret(id: string): SessionSecret {
    const row = this.sql
      .prepare("SELECT secret FROM accounts WHERE id=?")
      .get(id) as { secret: string } | undefined;
    if (!row) throw new DatalomError("INVALID_INPUT", "账号不存在");
    return this.vault.open(row.secret, `account:${id}`);
  }
  importAccount(
    input: {
      profileId: string;
      workspaceId: string;
      label: string;
      identity: string;
    },
    secret: SessionSecret,
  ): Account {
    return this.sql
      .transaction(() => {
        const old = this.sql
          .prepare(
            "SELECT * FROM accounts WHERE platform=? AND workspaceId=? AND profileId=?",
          )
          .get("tiktok", input.workspaceId, input.profileId) as any;
        if (old?.lease && old.leaseUntil > Date.now())
          throw new DatalomError(
            "CONFLICT",
            "账号正在执行任务，请暂停任务后重新提取",
          );
        const id = old?.id ?? randomUUID(),
          now = Date.now();
        this.db
          .insert(accounts)
          .values({
            id,
            platform: "tiktok",
            ...input,
            version: (old?.version ?? 0) + 1,
            status: "pending",
            updatedAt: now,
            secret: this.vault.seal(secret, `account:${id}`),
          })
          .onConflictDoUpdate({
            target: accounts.id,
            set: {
              ...input,
              version: (old?.version ?? 0) + 1,
              status: "pending",
              reason: "会话已提取，等待独立请求验证",
              updatedAt: now,
              validatedAt: null,
              secret: this.vault.seal(secret, `account:${id}`),
              lease: null,
              leaseUntil: null,
            },
          })
          .run();
        return this.getAccount(id);
      })
      .immediate();
  }
  saveSecret(
    id: string,
    version: number,
    secret: SessionSecret,
    lease: string,
  ): void {
    const result = this.sql
      .prepare(
        "UPDATE accounts SET secret=?, updatedAt=? WHERE id=? AND version=? AND lease=? AND leaseUntil>?",
      )
      .run(
        this.vault.seal(secret, `account:${id}`),
        Date.now(),
        id,
        version,
        lease,
        Date.now(),
      );
    if (result.changes !== 1)
      throw new DatalomError("CONFLICT", "会话版本或租约已变化，拒绝覆盖");
  }
  patchAccount(
    id: string,
    patch: { label?: string; notes?: string; status?: AccountStatus },
  ): void {
    this.getAccount(id);
    this.db
      .update(accounts)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(accounts.id, id))
      .run();
  }
  status(id: string, status: AccountStatus, reason = "", cooldownMs = 0): void {
    this.sql
      .prepare(
        "UPDATE accounts SET status=CASE WHEN status='disabled' THEN status ELSE ? END,reason=?,nextAllowedAt=MAX(nextAllowedAt,?),validatedAt=CASE WHEN ?='ready' THEN ? ELSE validatedAt END WHERE id=?",
      )
      .run(status, reason, Date.now() + cooldownMs, status, Date.now(), id);
  }
  lease(id: string, allowPending = false): string | null {
    const token = randomUUID(),
      now = Date.now();
    const result = this.sql
      .prepare(
        `UPDATE accounts SET lease=?,leaseUntil=? WHERE id=? AND (lease IS NULL OR leaseUntil<?) AND nextAllowedAt<=? AND (status='ready' OR status='cooldown' ${allowPending ? "OR status='pending' OR status='login_required'" : ""})`,
      )
      .run(token, now + 60000, id, now, now);
    return result.changes ? token : null;
  }
  renew(id: string, token: string): boolean {
    return (
      this.sql
        .prepare(
          "UPDATE accounts SET leaseUntil=? WHERE id=? AND lease=? AND leaseUntil>?",
        )
        .run(Date.now() + 60000, id, token, Date.now()).changes === 1
    );
  }
  release(id: string, token: string): void {
    this.sql
      .prepare(
        "UPDATE accounts SET lease=NULL,leaseUntil=NULL WHERE id=? AND lease=?",
      )
      .run(id, token);
  }
  accountPolicy(id: string) {
    this.getAccount(id);
    return this.getSetting<{ minIntervalMs: number }>(`account-policy:${id}`) ?? { minIntervalMs: 3000 };
  }
  setAccountPolicy(id: string, minIntervalMs: number) {
    this.getAccount(id);
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 3000 || minIntervalMs > 3600000)
      throw new DatalomError("INVALID_INPUT", "请求间隔应为 3000 至 3600000 毫秒");
    this.setSetting(`account-policy:${id}`, { minIntervalMs });
  }
  coolDownAccount(id: string, reason: string) {
    this.sql.transaction(() => {
      const key = `account-rate-strikes:${id}`;
      const strikes = Math.min((this.getSetting<number>(key) ?? 0) + 1, 7);
      this.setSetting(key, strikes);
      this.status(id, "cooldown", reason, Math.min(3600000, 60000 * 2 ** (strikes - 1)));
    }).immediate();
  }
  resetRateStrikes(id: string) {
    this.setSetting(`account-rate-strikes:${id}`, 0);
  }
  scheduleNext(id: string, token: string, interval = 3000): void {
    this.sql
      .prepare(
        "UPDATE accounts SET nextAllowedAt=MAX(nextAllowedAt,?) WHERE id=? AND lease=?",
      )
      .run(Date.now() + Math.max(interval, this.getSetting<{ minIntervalMs: number }>(`account-policy:${id}`)?.minIntervalMs ?? interval), id, token);
  }
  reserveRate(
    id: string,
    lease: string,
    operation: string,
    interval = 3000,
  ): number {
    return this.sql
      .transaction(() => {
        const row = this.sql
          .prepare(
            "SELECT nextAllowedAt FROM accounts WHERE id=? AND lease=? AND leaseUntil>?",
          )
          .get(id, lease, Date.now()) as { nextAllowedAt: number } | undefined;
        if (!row) throw new DatalomError("CONFLICT", "账号租约已过期");
        const route = this.getSecret(id).route;
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(route?.account ?? { id }))
          .digest("hex");
        const scopes: [string, number][] = [
          [`proxy:${fingerprint}`, 100],
          [`operation:${this.getAccount(id).platform}:${operation}`, 50],
        ];
        const now = Date.now();
        let at = Math.max(now, row.nextAllowedAt);
        for (const [scope] of scopes) {
          const limit = this.sql
            .prepare("SELECT nextAt FROM rate_limits WHERE scope=?")
            .get(scope) as { nextAt: number } | undefined;
          at = Math.max(at, limit?.nextAt ?? 0);
        }
        for (const [scope, spacing] of scopes)
          this.sql
            .prepare(
              "INSERT INTO rate_limits VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET nextAt=excluded.nextAt",
            )
            .run(scope, at + spacing);
        this.sql
          .prepare("UPDATE accounts SET nextAllowedAt=? WHERE id=? AND lease=?")
          .run(at + Math.max(interval, this.getSetting<{ minIntervalMs: number }>(`account-policy:${id}`)?.minIntervalMs ?? interval), id, lease);
        return Math.max(0, at - now);
      })
      .immediate();
  }
  setSetting(key: string, value: unknown): void {
    this.sql
      .prepare(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, this.vault.seal(value, `setting:${key}`));
  }
  getSetting<T>(key: string): T | undefined {
    const row = this.sql
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key) as any;
    return row ? this.vault.open<T>(row.value, `setting:${key}`) : undefined;
  }
  enqueue(
    input: TaskInput,
    requestId: string = randomUUID(),
    deadline = Date.now() + 300000,
  ) {
    return this.sql
      .transaction(() => {
        const account = this.getAccount(input.accountId);
        if (account.status === "disabled")
          throw new DatalomError("CONFLICT", "账号已禁用");
        const previous = this.db
          .select()
          .from(tasks)
          .where(eq(tasks.requestId, requestId))
          .get();
        if (previous) {
          if (previous.input !== JSON.stringify(input))
            throw new DatalomError("CONFLICT", "requestId 已用于不同请求");
          return this.task(previous.id);
        }
        const id = randomUUID(),
          now = Date.now();
        this.db
          .insert(tasks)
          .values({
            id,
            requestId,
            accountId: input.accountId,
            status: "queued",
            input: JSON.stringify(input),
            createdAt: now,
            updatedAt: now,
            deadline,
          })
          .run();
        this.diagnostics.event(
          { taskId: id, requestId, accountId: input.accountId },
          "queue",
          "submitted",
          { input, deadline },
        );
        return this.task(id);
      })
      .immediate();
  }
  task(id: string): any {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!row) throw new DatalomError("INVALID_INPUT", "任务不存在");
    const { lease, ...safe } = row;
    return {
      ...safe,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error ? JSON.parse(row.error) : null,
    };
  }
  listTasks(): any[] {
    return this.db
      .select({ id: tasks.id })
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(100)
      .all()
      .map((x) => this.task(x.id));
  }
  claim(): { task: any; lease: string } | null {
    return this.sql
      .transaction(() => {
        const now = Date.now();
        const interrupted = this.sql
          .prepare(
            "SELECT id FROM tasks WHERE status='running' AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id=tasks.accountId AND a.lease=tasks.lease AND a.leaseUntil>?)",
          )
          .all(now) as { id: string }[];
        const expired = this.sql
          .prepare("SELECT id FROM tasks WHERE status='queued' AND deadline<=?")
          .all(now) as { id: string }[];
        for (const row of [...interrupted, ...expired]) {
          const task = this.task(row.id);
          const code = task.status === "running" ? "INTERRUPTED" : "DEADLINE";
          this.diagnostics.event(
            {
              taskId: task.id,
              accountId: task.accountId,
              requestId: task.requestId,
            },
            "recovery",
            "failed",
            { pages: task.pages, lastUpdatedAt: task.updatedAt },
            code,
          );
          this.diagnostics.issue(task, code);
        }
        this.sql
          .prepare(
            "UPDATE tasks SET status='failed',error=?,updatedAt=? WHERE status='running' AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id=tasks.accountId AND a.lease=tasks.lease AND a.leaseUntil>?)",
          )
          .run(
            JSON.stringify({
              code: "NETWORK",
              message: "执行进程中断；已保存已完成页，可重新提交",
            }),
            now,
            now,
          );
        this.sql
          .prepare(
            "UPDATE tasks SET status='failed',error=?,updatedAt=? WHERE status='queued' AND deadline<=?",
          )
          .run(
            JSON.stringify({ code: "DEADLINE", message: "排队超时" }),
            now,
            now,
          );
        const running = this.sql
          .prepare(
            "SELECT COUNT(*) count FROM accounts WHERE lease IS NOT NULL AND leaseUntil>?",
          )
          .get(now) as { count: number };
        if (running.count >= 20) return null;
        const queue = this.sql
          .prepare(
            "SELECT t.id,t.accountId FROM tasks t JOIN accounts a ON a.id=t.accountId WHERE t.status='queued' AND t.deadline>? AND t.cancelled=0 AND a.status IN ('pending','ready','cooldown') AND a.nextAllowedAt<=? AND (a.lease IS NULL OR a.leaseUntil<=?) ORDER BY t.createdAt LIMIT 100",
          )
          .all(now, now, now) as any[];
        for (const row of queue) {
          if (this.getAccount(row.accountId).status === "login_required")
            continue;
          const lease = this.lease(row.accountId, true);
          if (!lease) continue;
          this.sql
            .prepare(
              "UPDATE tasks SET status='running',lease=?,updatedAt=? WHERE id=?",
            )
            .run(lease, now, row.id);
          const task = this.task(row.id);
          this.diagnostics.event(
            {
              taskId: task.id,
              requestId: task.requestId,
              accountId: row.accountId,
            },
            "queue",
            "claimed",
            { waitedMs: now - task.createdAt, pid: process.pid },
          );
          return { task: this.task(row.id), lease };
        }
        return null;
      })
      .immediate();
  }
  progress(id: string, lease: string, result: unknown, pages: number): void {
    this.sql
      .prepare(
        "UPDATE tasks SET result=?,pages=?,updatedAt=? WHERE id=? AND lease=? AND status='running'",
      )
      .run(JSON.stringify(result), pages, Date.now(), id, lease);
  }
  finish(id: string, lease: string, status: string, error?: unknown): void {
    this.sql
      .prepare(
        "UPDATE tasks SET status=CASE WHEN cancelled=1 THEN 'cancelled' ELSE ? END,error=?,updatedAt=? WHERE id=? AND lease=? AND status='running'",
      )
      .run(status, error ? JSON.stringify(error) : null, Date.now(), id, lease);
  }
  cancel(id: string): void {
    const task = this.task(id);
    this.diagnostics.event(
      { taskId: id, requestId: task.requestId, accountId: task.accountId },
      "cancel",
      "requested",
    );
    this.sql
      .prepare(
        "UPDATE tasks SET cancelled=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updatedAt=? WHERE id=? AND status IN ('queued','running')",
      )
      .run(Date.now(), id);
  }
  evidence(
    accountId: string | null,
    kind: string,
    summary: string,
    payload: unknown,
  ): string {
    const id = randomUUID();
    this.sql
      .prepare("INSERT INTO evidence VALUES (?,?,?,?,?,?)")
      .run(
        id,
        accountId,
        kind,
        summary,
        this.vault.seal(payload, `evidence:${id}`),
        Date.now(),
      );
    return id;
  }
  listEvidence(): unknown[] {
    return this.sql
      .prepare(
        "SELECT id,accountId,kind,summary,createdAt FROM evidence ORDER BY createdAt DESC LIMIT 100",
      )
      .all();
  }
  metric(
    taskId: string,
    accountId: string,
    operation: string,
    code: string,
    durationMs: number,
  ): void {
    this.sql
      .prepare(
        "INSERT INTO metrics(taskId,accountId,operation,code,durationMs,createdAt) VALUES (?,?,?,?,?,?)",
      )
      .run(taskId, accountId, operation, code, durationMs, Date.now());
  }
  metrics(): unknown[] {
    return this.sql
      .prepare(
        "SELECT operation,code,COUNT(*) calls,ROUND(AVG(durationMs)) averageMs FROM metrics GROUP BY operation,code",
      )
      .all();
  }
  heartbeat(id: string): void {
    this.sql
      .prepare(
        "INSERT INTO workers VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat",
      )
      .run(id, process.pid, Date.now());
  }
  removeWorker(id: string): void {
    this.sql.prepare("DELETE FROM workers WHERE id=?").run(id);
  }
  workers(): unknown[] {
    return this.sql
      .prepare("SELECT id,pid,heartbeat FROM workers WHERE heartbeat>?")
      .all(Date.now() - 15000);
  }
  close(): void {
    this.sql.close();
  }
}
