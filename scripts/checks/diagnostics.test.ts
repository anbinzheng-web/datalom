import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.ts";
import { errorRecord } from "@datalom/shared/runtime/diagnostics";
import { HttpTransport } from "@datalom/network-node/transport";
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
