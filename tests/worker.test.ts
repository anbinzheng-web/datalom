import { it, expect } from "vitest";
import { Runner } from "@datalom/worker/runner";
import {
  DatalomError,
  type PlatformAdapter,
} from "@datalom/runtime-node/contracts";
import { fixture } from "./helpers.ts";
const factory = async () => ({
  transport: {
    request: async () => {
      throw new Error("Not used by offline adapter");
    },
  },
  save() {},
  close() {},
});
it("accepts an empty terminal page and cancels a running task without losing its completed page", async () => {
  const f = fixture();
  let called = 0;
  const adapter: PlatformAdapter = {
    platform: "fixture",
    version: "fixture",
    async execute(input, context) {
      called++;
      if (called === 1)
        return {
          data: [],
          cursor: "0",
          hasMore: false,
          adapterVersion: "fixture",
        };
      if (called === 2)
        return {
          data: [{ cid: "saved" }],
          cursor: "20",
          hasMore: true,
          adapterVersion: "fixture",
        };
      await new Promise((_, reject) => {
        context.signal.addEventListener(
          "abort",
          () => reject(new DatalomError("CANCELLED", "cancelled")),
          { once: true },
        );
      });
      throw new Error("unreachable");
    },
  };
  const runner = new Runner(f.store, adapter, factory, 1);
  try {
    const t = f.store.enqueue({
      accountId: f.account.id,
      operation: "video.comments",
      video: "7685551053554617613",
    });
    expect((await settle(f, runner, t.id)).result.data).toEqual([]);
    await new Promise((r) => setTimeout(r, 110));
    const second = f.store.enqueue({
      accountId: f.account.id,
      operation: "video.comments",
      video: "7685551053554617613",
      maxPages: 3,
    });
    await runner.tick();
    for (let i = 0; i < 100 && called < 3; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(called).toBe(3);
    f.store.cancel(second.id);
    const result = await settle(f, runner, second.id);
    expect(result.status).toBe("cancelled");
    expect(result.result.data).toEqual([{ cid: "saved" }]);
    expect(result.pages).toBe(1);
  } finally {
    await runner.stop();
    f.cleanup();
  }
});
async function settle(
  f: ReturnType<typeof fixture>,
  runner: Runner,
  id: string,
) {
  await runner.tick();
  for (let i = 0; i < 200; i++) {
    const t = f.store.task(id);
    if (!["queued", "running"].includes(t.status)) return t;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("task did not settle");
}
it("collects three pages, deduplicates comments and stops at terminal page", async () => {
  const f = fixture();
  let calls = 0;
  const adapter: PlatformAdapter = {
    platform: "fixture",
    version: "fixture",
    async execute() {
      calls++;
      return {
        data: [{ cid: String(calls) }, { cid: "shared" }],
        cursor: String(calls),
        hasMore: calls < 3,
        adapterVersion: "fixture",
      };
    },
  };
  const runner = new Runner(f.store, adapter, factory, 1);
  try {
    const t = f.store.enqueue({
      accountId: f.account.id,
      operation: "video.comments",
      video: "7685551053554617613",
      maxPages: 5,
    });
    const result = await settle(f, runner, t.id);
    expect(result.status).toBe("succeeded");
    expect(result.pages).toBe(3);
    expect(result.result.data).toHaveLength(4);
    expect(calls).toBe(3);
  } finally {
    await runner.stop();
    f.cleanup();
  }
});
it("does not repeat a stagnant cursor and retains completed data", async () => {
  const f = fixture();
  const adapter: PlatformAdapter = {
    platform: "fixture",
    version: "fixture",
    async execute() {
      return {
        data: [{ cid: "1" }],
        cursor: "0",
        hasMore: true,
        adapterVersion: "fixture",
      };
    },
  };
  const runner = new Runner(f.store, adapter, factory, 1);
  try {
    const t = f.store.enqueue({
      accountId: f.account.id,
      operation: "video.comments",
      video: "7685551053554617613",
      maxPages: 3,
    });
    const result = await settle(f, runner, t.id);
    expect(result.error.code).toBe("SCHEMA_CHANGED");
    expect(result.pages).toBe(1);
  } finally {
    await runner.stop();
    f.cleanup();
  }
});
it("retries a transient network error once and never retries a challenge", async () => {
  for (const code of ["NETWORK", "CHALLENGE"] as const) {
    const f = fixture();
    let calls = 0;
    const adapter: PlatformAdapter = {
      platform: "fixture",
      version: "fixture",
      async execute() {
        calls++;
        throw new DatalomError(code, "fixture error");
      },
    };
    const runner = new Runner(f.store, adapter, factory, 1);
    try {
      const t = f.store.enqueue({
        accountId: f.account.id,
        operation: "video.detail",
        video: "7685551053554617613",
      });
      const result = await settle(f, runner, t.id);
      expect(result.status).toBe("failed");
      expect(calls).toBe(code === "NETWORK" ? 2 : 1);
      expect(f.store.listEvidence()).toHaveLength(1);
    } finally {
      await runner.stop();
      f.cleanup();
    }
  }
});
