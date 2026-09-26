import { it, expect } from "vitest";
import {
  readRecords,
  writeRecords,
  packSignature,
  unpackSignature,
  decodeGnarly,
  decodeDynosaur,
  encodeField,
  intBuffer,
  md5,
  fnvHash,
} from "../signature-codec.ts";
import { signRequest } from "../signer.ts";
import { signInProcess } from "../signer-process.ts";
function template() {
  const base =
    "aid=1988&aweme_id=7669255703952985375&cursor=0&referer=a%20b%2Fc";
  const ua = "Fixture Chrome";
  const hash = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const fields: Record<number, string | number> = {
    32: "1",
    33: "1",
    34: "1",
    35: "0",
    36: 123,
    37: 4,
    38: 1,
    39: 1700000000,
    40: 123,
    41: "0",
    42: "5.3.2",
    43: fnvHash(""),
    44: 123456,
    45: "0",
    46: fnvHash(base),
    47: 8,
    48: fnvHash(ua),
    49: "2.0.0.561",
    50: "2.0.0.1667",
    51: "fixture-digest",
    52: 456,
    53: "https://fixture.invalid/",
    54: 0,
    55: 0,
    56: fnvHash(""),
  };
  const records = Object.entries(fields).map(([tag, value]) => ({
    tag: Number(tag),
    value: [43, 46, 48, 56].includes(Number(tag))
      ? hash(Number(value))
      : encodeField(value, [32, 33, 34].includes(Number(tag))),
  }));
  const d = packSignature(writeRecords(records, false), Buffer.alloc(48, 17));
  const query = `${base}&X-Dynosaur=${encodeURIComponent(d)}&msToken=fixture-token`;
  const g: Record<number, string | number> = {
    0: 0,
    1: 1,
    2: 0,
    3: md5(query),
    4: md5(""),
    5: md5(ua),
    6: 1700000000,
    7: 123456,
    8: 456,
    9: "5.3.2",
    10: "2.0.0.561",
    11: 1,
    12: 8,
    13: 4,
    14: 100,
    15: 200,
    16: 0,
  };
  const gnarly = packSignature(
    writeRecords(
      Object.entries(g).map(([tag, value]) => ({
        tag: Number(tag),
        value:
          typeof value === "number" ? intBuffer(value) : Buffer.from(value),
      })),
      true,
    ),
    Buffer.alloc(48, 19),
  );
  return {
    url: `https://www.tiktok.com/api/comment/list/?${query}&X-Bogus=1&X-Gnarly=${encodeURIComponent(gnarly)}`,
    ua,
  };
}
it("decodes an independently implemented upstream encoder", async () => {
  const { default: encode } = await import(
    new URL(
      "../vendor/tiktok-signatures/xgnarly.mjs",
      import.meta.url,
    ).href
  );
  const token = encode(
    "a=1",
    "",
    "fixture-user-agent",
    0,
    "5.1.1",
    1700000000000,
  );
  const fields = decodeGnarly(token);
  expect(fields[3]).toBe(md5("a=1"));
  expect(fields[5]).toBe(md5("fixture-user-agent"));
  expect(fields[6]).toBe(1700000000);
  expect(fields[9]).toBe("5.1.1");
  const unpacked = unpackSignature(token);
  expect(packSignature(unpacked.payload, unpacked.key)).toBe(token);
});
it("generates fresh signatures for a new page and preserves raw query encoding", () => {
  const t = template(),
    url = new URL(
      signRequest({
        templateUrl: t.url,
        userAgent: t.ua,
        updates: { cursor: "20" },
        now: 1800000000000,
        counter: 2,
      }),
    );
  expect(url.search).toContain("referer=a%20b%2Fc");
  expect(url.searchParams.get("cursor")).toBe("20");
  const g = decodeGnarly(url.searchParams.get("X-Gnarly")!),
    d = decodeDynosaur(url.searchParams.get("X-Dynosaur")!);
  expect(g[6]).toBe(1800000000);
  expect(d[39]).toBe("1800000000");
  expect(g[12]).toBe(10);
  expect(g[13]).toBe(6);
  expect(g[8]).toBe(456);
  const gnarlyInput = url.search
    .slice(1)
    .split("&")
    .filter((x) => !/^X-(Bogus|Gnarly)=/.test(x))
    .join("&");
  expect(g[3]).toBe(md5(gnarlyInput));
  const dynoInput = url.search
    .slice(1)
    .split("&")
    .filter((x) => !/^X-|^msToken=/.test(x))
    .join("&");
  expect(d[46]).toBe(fnvHash(dynoInput));
  const original = new URL(t.url);
  expect(url.searchParams.get("X-Gnarly")).not.toBe(
    original.searchParams.get("X-Gnarly"),
  );
  expect(url.searchParams.get("X-Dynosaur")).not.toBe(
    original.searchParams.get("X-Dynosaur"),
  );
});
it("rejects changed captured query bytes and runs signing without browser access", async () => {
  const t = template();
  expect(() =>
    signRequest({
      templateUrl: t.url.replace("cursor=0", "cursor=10"),
      userAgent: t.ua,
      updates: {},
    }),
  ).toThrow(/序列化/);
  const url = await signInProcess(
    { templateUrl: t.url, userAgent: t.ua, updates: { cursor: "40" } },
    AbortSignal.timeout(5000),
  );
  expect(new URL(url).searchParams.get("cursor")).toBe("40");
  const controller = new AbortController();
  controller.abort();
  await expect(
    signInProcess(
      { templateUrl: t.url, userAgent: t.ua, updates: {} },
      controller.signal,
    ),
  ).rejects.toThrow(/取消/);
});
it("rejects malformed record layouts instead of silently truncating", () => {
  expect(() => readRecords(Buffer.from([1, 1, 255, 255]), true)).toThrow();
});
