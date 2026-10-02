import { describe, expect, it, vi } from "vitest";
import {
  executeNative,
  parseNative,
  validateNativeInput,
  type NativeInput,
} from "../native.ts";
import type {
  RequestTemplate,
  ExecutionContext,
} from "@datalom/shared/runtime/contracts";
import { session } from "../../../../scripts/checks/helpers.ts";
vi.mock("../signer-process.ts", () => ({
  signInProcess: vi.fn(
    async () =>
      "https://www.tiktok.com/api/comment/list/reply/?fresh=signature",
  ),
}));
const template: RequestTemplate = {
  url: "https://www.tiktok.com/api/comment/list/reply/?item_id=1&comment_id=2&cursor=0&count=3",
  headers: {},
  capturedAt: 1,
};
const input: NativeInput = {
  operation: "comment.replies",
  parameters: { item_id: "1", comment_id: "2", cursor: "0", count: "3" },
};
const comment = {
  cid: "3",
  aweme_id: "1",
  reply_id: "2",
  reply_to_reply_id: "0",
  reply_to_userid: "4",
};
const body = (changes = {}) =>
  JSON.stringify({
    status_code: 0,
    comments: [comment],
    cursor: 3,
    has_more: 0,
    ...changes,
  });
describe("original reply protocol", () => {
  it("preserves root, child target, and original fields without collapsing relationships", () => {
    const comments = [
      comment,
      { ...comment, cid: "5", reply_to_reply_id: "3", extra: "preserved" },
    ];
    const r = parseNative(input, 200, body({ comments }));
    expect(r.raw.comments).toEqual(comments);
    expect(r.count).toBe(2);
    expect(r.hasMore).toBe(false);
  });
  it.each([
    [{ ...comment, aweme_id: "9" }],
    [{ ...comment, reply_id: "9" }],
    [{ ...comment, reply_to_reply_id: undefined }],
    [{ ...comment, cid: 3 }],
    [comment, comment],
  ])(
    "rejects mismatched, missing or duplicate identities: %j",
    (...comments) => {
      expect(() => parseNative(input, 200, body({ comments }))).toThrow();
    },
  );
  it("accepts an empty terminal page while rejecting nonadvancing and imprecise cursors", () => {
    expect(
      parseNative(input, 200, body({ comments: [], cursor: 0 })).count,
    ).toBe(0);
    expect(() =>
      parseNative(input, 200, body({ cursor: 0, has_more: 1 })),
    ).toThrow(/游标/);
    expect(() =>
      parseNative(input, 200, body({ cursor: Number.MAX_SAFE_INTEGER + 1 })),
    ).toThrow(/游标/);
    expect(() => parseNative(input, 200, body({ has_more: "0" }))).toThrow(
      /标志/,
    );
  });
  it.each([429, 401, 403, 503])(
    "classifies HTTP %s before accepting business success",
    (status) => {
      expect(() => parseNative(input, status, body())).toThrow();
    },
  );
  it("rejects absent data and nonzero business codes", () => {
    expect(() => parseNative(input, 200, body({ comments: null }))).toThrow(
      /数组/,
    );
    expect(() => parseNative(input, 200, body({ status_code: 42 }))).toThrow(
      /业务/,
    );
  });
});
describe("bounded native input and diagnostics", () => {
  it.each([
    "https://evil.example/api/comment/list/reply/",
    "https://www.tiktok.com/api/comment/list/",
    "https://user:pass@www.tiktok.com/api/comment/list/reply/",
  ])("rejects template target %s", (url) => {
    expect(() => validateNativeInput(input, { ...template, url })).toThrow();
  });
  it("requires explicit identities and refuses extra parameters and oversized pages", () => {
    const cases: Record<string, string>[] = [
      { ...input.parameters, cookie: "x" },
      { ...input.parameters, count: "51" },
      { ...input.parameters, count: "0" },
      { cursor: "0" },
    ];
    for (const parameters of cases)
      expect(() =>
        validateNativeInput({ ...input, parameters }, template),
      ).toThrow();
  });
  it("stores raw response before parse failure and never automatically retries", async () => {
    const order: string[] = [];
    const request = vi.fn(async () => ({
      status: 200,
      body: "",
      headers: new Headers(),
    }));
    const trace = vi.fn();
    const ctx = {
      session: session(),
      signal: AbortSignal.timeout(5000),
      transport: { request },
      recordEvidence: vi.fn(() => order.push("evidence")),
      saveSession: () => order.push("save"),
      trace,
    } as unknown as ExecutionContext;
    await expect(executeNative(input, template, ctx)).rejects.toMatchObject({
      code: "SCHEMA_CHANGED",
    });
    expect(order).toEqual(["evidence", "save"]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(trace).toHaveBeenCalledWith(
      "native-failure",
      "failed",
      expect.objectContaining({ stage: "parse" }),
      "SCHEMA_CHANGED",
    );
  });
});

describe("music, lists and regional live contracts", () => {
  it("rejects a followers template from a different scene", () => {
    expect(() =>
      validateNativeInput(
        { operation: "user.followers", parameters: { secUid: "user" } },
        { ...template, url: "https://www.tiktok.com/api/user/list/?scene=151" },
      ),
    ).toThrow(/scene/);
  });
  it("rejects cross-origin templates even when the path matches", () => {
    expect(() =>
      validateNativeInput(
        { operation: "live.gifts", parameters: { room_id: "1" } },
        { ...template, url: "https://www.tiktok.com/webcast/gift/list/" },
      ),
    ).toThrow(/路径/);
  });
  it("checks music and playlist identities", () => {
    expect(() =>
      parseNative(
        { operation: "music.detail", parameters: { musicId: "1" } },
        200,
        JSON.stringify({ status_code: 0, musicInfo: { music: { id: "2" } } }),
      ),
    ).toThrow(/ID/);
    expect(() =>
      parseNative(
        { operation: "playlist.detail", parameters: { mixId: "1" } },
        200,
        JSON.stringify({ status_code: 0, mixInfo: { id: "2" } }),
      ),
    ).toThrow(/ID/);
  });
  it("requires string room IDs and explicit off-air status without precision loss", () => {
    const i: NativeInput = {
      operation: "live.alive",
      parameters: { room_ids: "7683824912389213470" },
    };
    const b = {
      status_code: 0,
      data: [{ room_id_str: i.parameters.room_ids, alive: false }],
    };
    expect(parseNative(i, 200, JSON.stringify(b)).count).toBe(1);
    expect(() =>
      parseNative(i, 200, JSON.stringify({ ...b, data: [] })),
    ).toThrow(/缺少/);
    expect(() =>
      parseNative(
        i,
        200,
        JSON.stringify({
          ...b,
          data: [{ room_id: 7683824912389213470, alive: true }],
        }),
      ),
    ).toThrow(/房间/);
  });
  it("validates nested live lists and rejects a misleading 404 success body", () => {
    const i: NativeInput = {
      operation: "live.gifts",
      parameters: { room_id: "1" },
    };
    expect(
      parseNative(
        i,
        200,
        JSON.stringify({ status_code: 0, data: { gifts: [] } }),
      ).count,
    ).toBe(0);
    expect(() =>
      parseNative(i, 200, JSON.stringify({ status_code: 0, data: {} })),
    ).toThrow(/结构/);
    expect(() =>
      parseNative(
        i,
        404,
        JSON.stringify({ status_code: 0, data: { gifts: [] } }),
      ),
    ).toThrow(/404/);
  });
});
it("preserves unknown pagination for the observed suggested-host live feed variant", () => {
  const r = parseNative(
    { operation: "live.feed", parameters: { channel_id: "86" } },
    200,
    JSON.stringify({
      status_code: 0,
      data: [{ rid: "1" }],
      extra: { max_time: 123, total: 1 },
    }),
  );
  expect(r.count).toBe(1);
  expect(r.hasMore).toBeUndefined();
  expect(r.raw.extra.max_time).toBe(123);
});

describe('public video operations using native responses', () => {
  it('retains the full detail response and rejects mismatched video IDs', () => {
    const input: NativeInput = { operation: 'video.detail', parameters: { itemId: '123' } };
    const raw = { status_code: 0, itemInfo: { itemStruct: { id: '123' } }, extra: { logid: 'fixture' } };
    expect(parseNative(input, 200, JSON.stringify(raw)).raw).toEqual(raw);
    expect(() => parseNative({ ...input, parameters: { itemId: '456' } }, 200, JSON.stringify(raw))).toThrow('ID');
  });
  it('validates comment identities and preserves pagination metadata', () => {
    const input: NativeInput = { operation: 'video.comments', parameters: { aweme_id: '123', cursor: '0' } };
    const raw = { status_code: 0, comments: [{ cid: '1', text: 'hello' }], cursor: 20, has_more: 1, total: 40 };
    expect(parseNative(input, 200, JSON.stringify(raw))).toMatchObject({ raw, cursor: '20', hasMore: true });
    expect(() => parseNative(input, 200, JSON.stringify({ ...raw, comments: [{}] }))).toThrow('ID');
  });
});
