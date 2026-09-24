import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.ts";
import { Runner } from "../apps/worker/src/runner.ts";
import { buildApp, authToken } from "../apps/server/src/app.ts";
import { errorRecord } from "../src/core/diagnostics.ts";
import { SpiderError } from "../src/core/contracts.ts";
import { HttpTransport } from "../src/network/transport.ts";
import { CookieJar } from "tough-cookie";
const input = (id: string) => ({
  accountId: id,
  operation: "video.detail" as const,
  video: "7685551053554617613",
});
it("records native impit connection failures through an unreachable local proxy without direct fallback", async () => {
  const f = fixture();
  try {
    const transport = new HttpTransport(
      "http://127.0.0.1:1",
      new CookieJar(),
      {},
      undefined,
      (stage, outcome, payload) => {
        f.store.diagnostics.event({}, stage, outcome, payload);
      },
    );
    await expect(
      transport.request("https://www.tiktok.com/", {
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({ code: "NETWORK", cause: expect.any(Error) });
    const event = (f.store.diagnostics.events() as any[]).find(
      (e) => e.stage === "http" && e.outcome === "failed",
    );
    const raw = f.store.diagnostics.rawEvent(event.id) as any;
    expect(raw.error.message).toBeTruthy();
    expect(raw.error.stack).toBeTruthy();
    expect(raw.durationMs).toBeGreaterThanOrEqual(0);
  } finally {
    f.cleanup();
  }
});
it("preserves failed attempts, native causes and session snapshots without leaking them in reports or database plaintext", async () => {
  const f = fixture();
  const runner = new Runner(
    f.store,
    {
      platform: "test",
      version: "test-v2",
      async execute(_input, context) {
        context.trace?.("sign", "started", { token: "private-signature" });
        throw new SpiderError("NETWORK", "代理连接失败", {
          cause: Object.assign(
            new Error("secret-cookie-fixture upstream failed"),
            { code: "ECONNRESET" },
          ),
        });
      },
    },
    async () => ({
      transport: {
        request: async () => {
          throw new Error("unused");
        },
      },
      save() {},
      close() {},
    }),
    1,
  );
  try {
    const task = f.store.enqueue(input(f.account.id));
    await runner.tick();
    for (let i = 0; i < 200 && f.store.task(task.id).status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(f.store.task(task.id).status).toBe("failed");
    const report = f.store.diagnostics.bundle(f.store.task(task.id));
    const failures = (report.events as any[]).filter(
      (e) => e.stage === "attempt" && e.outcome === "failed",
    );
    expect(failures.map((e) => e.attempt)).toEqual([1, 2]);
    const raw = f.store.diagnostics.rawEvent(failures[0].id) as any;
    expect(raw.error.cause.code).toBe("ECONNRESET");
    expect(raw.error.cause.stack).toContain("secret-cookie-fixture");
    expect(raw.failedStage).toBe("sign");
    expect(report.incident.certainty).toBe("unconfirmed");
    expect(JSON.stringify(report)).not.toMatch(
      /secret-cookie-fixture|private-signature|secret-proxy-fixture/,
    );
    expect(
      (report.events as any[]).every(
        (e) => e.taskId === task.id && e.requestId === task.requestId,
      ),
    ).toBe(true);
    const bytes = Buffer.concat([
      readFileSync(join(f.dir, "spider.sqlite")),
      readFileSync(join(f.dir, "spider.sqlite-wal")),
    ]).toString("utf8");
    expect(bytes).not.toMatch(
      /secret-cookie-fixture|private-signature|secret-proxy-fixture/,
    );
  } finally {
    await runner.stop();
    f.cleanup();
  }
});
it("creates evidence for expired queues and interrupted workers; legacy tasks disclose missing history", () => {
  const f = fixture();
  try {
    const interrupted = f.store.enqueue(input(f.account.id));
    f.store.claim();
    f.store.sql
      .prepare("UPDATE accounts SET leaseUntil=0 WHERE id=?")
      .run(f.account.id);
    const expired = f.store.enqueue(
      input(f.account.id),
      "expired-test",
      Date.now() - 100,
    );
    f.store.claim();
    expect(f.store.diagnostics.incident(interrupted.id).code).toBe(
      "INTERRUPTED",
    );
    expect(f.store.diagnostics.incident(expired.id).code).toBe("DEADLINE");
    f.store.sql
      .prepare("DELETE FROM diagnostic_events WHERE taskId=?")
      .run(expired.id);
    expect(
      f.store.diagnostics.bundle(f.store.task(expired.id)).evidenceAvailable,
    ).toBe(false);
  } finally {
    f.cleanup();
  }
});
it("requires authenticated, revision-checked diagnosis and a matching successful regression to resolve", async () => {
  const f = fixture(),
    app = await buildApp(f.store);
  const headers = { authorization: `Bearer ${authToken(f.store)}` };
  try {
    const task = f.store.enqueue(input(f.account.id));
    f.store.diagnostics.issue(task, "SCHEMA_CHANGED");
    const url = `/api/tasks/${task.id}/diagnosis`;
    const payload = {
      revision: 1,
      state: "investigating",
      certainty: "hypothesis",
      cause: "test secret-cookie-fixture",
      nextExperiment: "compare response schema",
      fix: "",
    };
    expect((await app.inject({ method: "PUT", url, payload })).statusCode).toBe(
      401,
    );
    const saved = await app.inject({ method: "PUT", url, headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain("secret-cookie-fixture");
    expect(
      (await app.inject({ method: "PUT", url, headers, payload })).statusCode,
    ).toBe(409);
    const resolved = {
      ...payload,
      revision: 2,
      state: "resolved",
      certainty: "confirmed",
      fix: "updated parser",
    };
    expect(
      (await app.inject({ method: "PUT", url, headers, payload: resolved }))
        .statusCode,
    ).toBe(400);
    const regression = f.store.enqueue(input(f.account.id));
    f.store.sql
      .prepare("UPDATE tasks SET status='succeeded' WHERE id=?")
      .run(regression.id);
    expect(
      (
        await app.inject({
          method: "PUT",
          url,
          headers,
          payload: { ...resolved, regressionTaskId: regression.id },
        })
      ).statusCode,
    ).toBe(200);
    const report = await app.inject({
      url: `/api/tasks/${task.id}/diagnostics`,
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(
      report.json().events.filter((e: any) => e.stage === "diagnosis"),
    ).toHaveLength(2);
  } finally {
    await app.close();
    f.cleanup();
  }
});
it("writes encrypted fsynced emergency evidence and fails closed if the diagnostics table is unavailable", () => {
  const f = fixture();
  try {
    f.store.sql.exec("DROP TABLE diagnostic_events");
    expect(() => f.store.enqueue(input(f.account.id))).toThrow(
      /诊断数据库写入失败/,
    );
    expect(f.store.listTasks()).toHaveLength(0);
    expect(() =>
      f.store.diagnostics.event({}, "http", "started", {
        cookie: "secret-cookie-fixture",
      }),
    ).toThrow(/诊断数据库写入失败/);
    const raw = readFileSync(
      join(f.dir, "diagnostics/emergency.jsonl"),
      "utf8",
    );
    expect(raw).not.toContain("secret-cookie-fixture");
    const row = JSON.parse(raw.trim().split("\n").at(-1)!);
    const decoded = f.store.vault.open<any>(row.payload, `emergency:${row.id}`);
    expect(decoded.event.stage).toBe("http");
    expect(
      errorRecord(new Error("outer", { cause: new Error("inner") })),
    ).toHaveProperty("cause.message", "inner");
  } finally {
    f.cleanup();
  }
});
