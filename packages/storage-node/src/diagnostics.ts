import type Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { join } from "node:path";
import { Vault } from "./crypto.ts";
import { DatalomError } from "@datalom/runtime-node/contracts";

import {
  errorRecord,
  assessment,
  type TraceContext,
} from "@datalom/runtime-node/diagnostics";
export class Diagnostics {
  constructor(
    private sql: Database.Database,
    private vault: Vault,
    private dir: string,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS diagnostic_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, taskId TEXT, requestId TEXT,
      accountId TEXT, sessionVersion INTEGER, page INTEGER, attempt INTEGER, stage TEXT NOT NULL,
      outcome TEXT NOT NULL, code TEXT, createdAt INTEGER NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS diagnostic_task ON diagnostic_events(taskId,seq);
      CREATE TABLE IF NOT EXISTS incidents (taskId TEXT PRIMARY KEY REFERENCES tasks(id),
      state TEXT NOT NULL, revision INTEGER NOT NULL, code TEXT NOT NULL, createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL, payload TEXT NOT NULL);`);
  }
  event(
    context: TraceContext,
    stage: string,
    outcome: string,
    payload: unknown = {},
    code?: string,
  ) {
    const id = randomUUID(),
      createdAt = Date.now();
    const raw = JSON.stringify(payload);
    const row = {
      id,
      ...context,
      stage,
      outcome,
      code,
      createdAt,
      digest: createHash("sha256").update(raw).digest("hex"),
      payload: this.vault.seal(payload, `diagnostic:${id}`),
    };
    try {
      this.sql
        .prepare(
          `INSERT INTO diagnostic_events
        (id,taskId,requestId,accountId,sessionVersion,page,attempt,stage,outcome,code,createdAt,digest,payload)
        VALUES (@id,@taskId,@requestId,@accountId,@sessionVersion,@page,@attempt,@stage,@outcome,@code,@createdAt,@digest,@payload)`,
        )
        .run({
          taskId: null,
          requestId: null,
          accountId: null,
          sessionVersion: null,
          page: null,
          attempt: null,
          ...row,
        });
    } catch (error) {
      this.emergency({ event: row, persistenceError: errorRecord(error) });
      throw new DatalomError(
        "OBSERVABILITY",
        "诊断数据库写入失败，已停止执行；检查紧急日志与磁盘状态",
        { cause: error },
      );
    }
    return id;
  }
  // Separate file, append + fsync. Even the database failure and context are
  // encrypted. Failure of both sinks stops work; no fake successful recording.
  emergency(payload: unknown) {
    const id = randomUUID();
    try {
      const folder = join(this.dir, "diagnostics");
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const fd = openSync(join(folder, "emergency.jsonl"), "a", 0o600);
      try {
        writeSync(
          fd,
          JSON.stringify({
            id,
            createdAt: Date.now(),
            payload: this.vault.seal(payload, `emergency:${id}`),
          }) + "\n",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch {
      process.stderr.write(
        "DATALOM_DIAGNOSTICS_UNAVAILABLE: database and emergency evidence unavailable; stop and inspect storage.\n",
      );
      throw new DatalomError(
        "OBSERVABILITY",
        "数据库与紧急日志均不可写，执行已停止",
      );
    }
  }
  issue(task: any, code: string, payload: unknown = {}) {
    const now = Date.now();
    this.sql
      .prepare("INSERT OR IGNORE INTO incidents VALUES (?,?,?,?,?,?,?)")
      .run(
        task.id,
        "open",
        1,
        code,
        now,
        now,
        this.vault.seal(
          { ...assessment(code), detail: payload },
          `incident:${task.id}`,
        ),
      );
  }
  events(taskId?: string) {
    return this.sql
      .prepare(
        `SELECT seq,id,taskId,requestId,accountId,sessionVersion,page,attempt,stage,outcome,code,createdAt,digest
      FROM diagnostic_events ${taskId ? "WHERE taskId=?" : ""} ORDER BY seq ${taskId ? "ASC" : "DESC LIMIT 200"}`,
      )
      .all(...(taskId ? [taskId] : []));
  }
  incident(taskId: string): any {
    const row = this.sql
      .prepare("SELECT * FROM incidents WHERE taskId=?")
      .get(taskId) as any;
    if (!row) return null;
    const { payload, ...meta } = row;
    const { detail, ...body } = this.vault.open<any>(
      payload,
      `incident:${taskId}`,
    );
    const secrets: string[] = [];
    const account = this.sql
      .prepare(
        "SELECT a.id,a.secret FROM accounts a JOIN tasks t ON a.id=t.accountId WHERE t.id=?",
      )
      .get(taskId) as any;
    if (account) {
      const session = this.vault.open<any>(
        account.secret,
        `account:${account.id}`,
      );
      const collect = (value: unknown): void => {
        if (typeof value === "string" && value.length >= 4) secrets.push(value);
        else if (value && typeof value === "object")
          Object.values(value).forEach(collect);
      };
      session.cookies?.forEach((cookie: any) => collect(cookie.value));
      collect(session.storage);
      collect(session.route?.account?.password);
      collect(session.route?.upstream?.password);
    }
    const redact = (value: any): any => {
      if (typeof value === "string") {
        for (const secret of secrets)
          value = value.split(secret).join("[REDACTED]");
        return value
          .replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]")
          .replace(
            /((?:cookie|authorization|password|token|msToken|X-Gnarly|X-Dynosaur|X-Bogus)\s*[:=]\s*)[^\s;,]+/gi,
            "$1[REDACTED]",
          )
          .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
      }
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([key, v]) => [key, redact(v)]),
        );
      return value;
    };
    return { ...meta, ...redact(body) };
  }
  update(
    task: any,
    input: {
      revision: number;
      state: string;
      certainty: string;
      cause: string;
      nextExperiment: string;
      fix: string;
      regressionTaskId?: string;
    },
  ) {
    return this.sql
      .transaction(() => {
        const current = this.incident(task.id);
        if (!current || current.revision !== input.revision)
          throw new DatalomError("CONFLICT", "诊断记录已更新，请刷新后保存");
        if (input.state === "resolved") {
          const row = this.sql
            .prepare("SELECT * FROM tasks WHERE id=?")
            .get(input.regressionTaskId ?? "") as any;
          if (
            !row ||
            row.status !== "succeeded" ||
            row.id === task.id ||
            row.createdAt < current.createdAt ||
            row.accountId !== task.accountId ||
            JSON.parse(row.input).operation !== task.input.operation ||
            !input.fix.trim() ||
            !input.cause.trim() ||
            input.certainty !== "confirmed"
          )
            throw new DatalomError(
              "INVALID_INPUT",
              "解决问题需要确认原因、修复说明及问题发生后同账号同操作的成功回归任务",
            );
        } else if (!input.nextExperiment.trim())
          throw new DatalomError(
            "INVALID_INPUT",
            "未解决的问题必须记录下一步实验",
          );
        const { revision, ...body } = input;
        this.event(
          {
            taskId: task.id,
            accountId: task.accountId,
            requestId: task.requestId,
          },
          "diagnosis",
          input.state,
          { previous: current, ...input },
        );
        this.sql
          .prepare(
            "UPDATE incidents SET state=?,revision=revision+1,updatedAt=?,payload=? WHERE taskId=? AND revision=?",
          )
          .run(
            input.state,
            Date.now(),
            this.vault.seal(
              { observation: current.observation, ...body },
              `incident:${task.id}`,
            ),
            task.id,
            revision,
          );
        return this.incident(task.id);
      })
      .immediate();
  }
  bundle(task: any) {
    const events = this.events(task.id);
    return {
      formatVersion: 1,
      exportedAt: Date.now(),
      task,
      incident: this.incident(task.id),
      events,
      evidenceAvailable: events.length > 0,
      note: "本报告仅含时间线和诊断记录；原始请求、响应、会话快照及异常栈存于本机加密证据。旧任务无法补造历史日志。",
    };
  }
  rawEvent(id: string): unknown {
    const row = this.sql
      .prepare("SELECT payload FROM diagnostic_events WHERE id=?")
      .get(id) as any;
    if (!row) throw new DatalomError("INVALID_INPUT", "事件不存在");
    return this.vault.open(row.payload, `diagnostic:${id}`);
  }
}
