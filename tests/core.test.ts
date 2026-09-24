import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Vault } from "../src/core/crypto.ts";
import { Store } from "../src/core/store.ts";
import { fixture, session } from "./helpers.ts";
describe("encrypted account lifecycle", () => {
  it("authenticates both ciphertext and record identity", () => {
    const v = new Vault(randomBytes(32)),
      c = v.seal({ secret: "value" }, "a");
    expect(v.open(c, "a")).toEqual({ secret: "value" });
    expect(() => v.open(c, "b")).toThrow();
    expect(() => new Vault(randomBytes(32)).open(c, "a")).toThrow();
  });
  it("does not persist plaintext credentials and restores with same key", () => {
    const f = fixture();
    try {
      f.store.sql.pragma("wal_checkpoint(TRUNCATE)");
      const bytes = readFileSync(join(f.dir, "spider.sqlite")).toString();
      expect(bytes).not.toContain("secret-cookie-fixture");
      expect(bytes).not.toContain("secret-proxy-fixture");
      expect(JSON.stringify(f.store.listAccounts())).not.toContain("secret");
      const second = new Store(f.dir, new Vault(f.key));
      expect(second.getSecret(f.account.id).cookies[0].value).toBe(
        "secret-cookie-fixture",
      );
      second.close();
    } finally {
      f.cleanup();
    }
  });
  it("rejects extraction during a live lease, stale versions, and expired leases", () => {
    const f = fixture();
    try {
      const lease = f.store.lease(f.account.id, true)!;
      expect(lease).toBeTruthy();
      expect(f.store.lease(f.account.id, true)).toBeNull();
      expect(() => f.store.importAccount(f.account, session())).toThrow(/执行/);
      expect(() =>
        f.store.saveSecret(f.account.id, 99, session(), lease),
      ).toThrow(/版本/);
      f.store.sql.prepare("UPDATE accounts SET leaseUntil=0").run();
      expect(() =>
        f.store.saveSecret(f.account.id, 1, session(), lease),
      ).toThrow();
    } finally {
      f.cleanup();
    }
  });
  it("preserves disabled status when an in-flight request finishes", () => {
    const f = fixture();
    try {
      f.store.patchAccount(f.account.id, { status: "disabled" });
      f.store.status(f.account.id, "ready");
      expect(f.store.getAccount(f.account.id).status).toBe("disabled");
      expect(f.store.lease(f.account.id, true)).toBeNull();
    } finally {
      f.cleanup();
    }
  });
});
describe("durable queue", () => {
  it("caps concurrent account leases globally and shares proxy rate reservations", () => {
    const f = fixture();
    try {
      const ids = Array.from(
        { length: 21 },
        (_, i) =>
          f.store.importAccount(
            {
              profileId: `p-${i}`,
              workspaceId: "w",
              label: `A-${i}`,
              identity: "",
            },
            session(),
          ).id,
      );
      for (const id of ids)
        f.store.enqueue({
          accountId: id,
          operation: "video.detail",
          video: "7685551053554617613",
        });
      const leases = Array.from({ length: 20 }, () => f.store.claim());
      expect(leases.every(Boolean)).toBe(true);
      expect(f.store.claim()).toBeNull();
      const first = leases[0]!,
        second = leases[1]!;
      const start = f.store.reserveRate(
        first.task.accountId,
        first.lease,
        "video.detail",
      );
      const next = f.store.reserveRate(
        second.task.accountId,
        second.lease,
        "video.detail",
      );
      expect(next).toBeGreaterThanOrEqual(start + 90);
      const same = f.store.reserveRate(
        first.task.accountId,
        first.lease,
        "video.detail",
      );
      expect(same).toBeGreaterThanOrEqual(2900);
    } finally {
      f.cleanup();
    }
  });
  it("keeps accounts requiring login out of automatic scheduling", () => {
    const f = fixture();
    try {
      f.store.status(f.account.id, "login_required", "登录失效");
      f.store.enqueue({
        accountId: f.account.id,
        operation: "video.detail",
        video: "7685551053554617613",
      });
      expect(f.store.claim()).toBeNull();
    } finally {
      f.cleanup();
    }
  });
  it("enforces idempotency and prevents account overlap across processes", () => {
    const f = fixture();
    try {
      const input = {
        accountId: f.account.id,
        operation: "video.detail" as const,
        video: "7685551053554617613",
      };
      const a = f.store.enqueue(input, "request-1234");
      expect(f.store.enqueue(input, "request-1234").id).toBe(a.id);
      expect(() =>
        f.store.enqueue(
          { ...input, video: "7669255703952985375" },
          "request-1234",
        ),
      ).toThrow(/requestId/);
      f.store.enqueue(input);
      const second = new Store(f.dir, new Vault(f.key));
      expect(f.store.claim()).not.toBeNull();
      expect(second.claim()).toBeNull();
      second.close();
    } finally {
      f.cleanup();
    }
  });
  it("recovers interrupted tasks with partial results and expires overdue queued work", () => {
    const f = fixture();
    try {
      const input = {
        accountId: f.account.id,
        operation: "video.comments" as const,
        video: "7685551053554617613",
      };
      const task = f.store.enqueue(input),
        claimed = f.store.claim()!;
      f.store.progress(task.id, claimed.lease, { data: [{ cid: "1" }] }, 1);
      f.store.sql.prepare("UPDATE accounts SET leaseUntil=0").run();
      f.store.claim();
      const result = f.store.task(task.id);
      expect(result.status).toBe("failed");
      expect(result.pages).toBe(1);
      expect(result.result.data).toEqual([{ cid: "1" }]);
      const expired = f.store.enqueue(input, "expired-123", Date.now() - 1);
      f.store.claim();
      expect(f.store.task(expired.id).error.code).toBe("DEADLINE");
    } finally {
      f.cleanup();
    }
  });
  it("cancels queued work and cannot later claim it", () => {
    const f = fixture();
    try {
      const t = f.store.enqueue({
        accountId: f.account.id,
        operation: "video.detail",
        video: "7685551053554617613",
      });
      f.store.cancel(t.id);
      expect(f.store.task(t.id).status).toBe("cancelled");
      expect(f.store.claim()).toBeNull();
    } finally {
      f.cleanup();
    }
  });
});
