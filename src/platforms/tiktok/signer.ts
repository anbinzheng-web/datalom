import {
  decodeDynosaur,
  decodeGnarly,
  decodeField,
  encodeField,
  fnvHash,
  intBuffer,
  md5,
  packSignature,
  readRecords,
  unpackSignature,
  writeRecords,
  type SignatureRecord,
} from "./signature-codec.ts";
import { SpiderError } from "../../core/contracts.ts";
const signatures = ["X-Bogus", "X-Gnarly", "X-Dynosaur", "_signature"];
export interface SignInput {
  templateUrl: string;
  userAgent: string;
  updates: Record<string, string>;
  msToken?: string;
  now?: number;
  counter?: number;
}
function replaceField(records: SignatureRecord[], tag: number, value: Buffer) {
  const entry = records.find((r) => r.tag === tag);
  if (!entry) throw new SpiderError("RESEARCH_REQUIRED", `签名缺少字段 ${tag}`);
  entry.value = value;
}
const u32 = (n: number) => n >>> 0;
function xorIntegers(values: Record<number, string | number>) {
  return Object.values(values).reduce<number>(
    (x, v) => (typeof v === "number" ? u32(x ^ v) : x),
    0,
  );
}
function stringWord(s: string) {
  const b = Buffer.alloc(4);
  Buffer.from(s).copy(b, 0, 0, 4);
  return b.readUInt32BE();
}
function field14(env: number, ts: number, f8: number) {
  return u32(
    (env << 16) | ((ts >>> 16) ^ (f8 >>> 16) ^ (ts & 65535) ^ (f8 & 65535)),
  );
}
function rawQuery(
  url: URL,
  omit: string[],
  updates: Record<string, string> = {},
) {
  const used = new Set<string>();
  const parts = url.search
    .slice(1)
    .split("&")
    .filter(Boolean)
    .flatMap((part) => {
      const key = decodeURIComponent(part.split("=")[0]);
      if (omit.includes(key)) return [];
      used.add(key);
      return [
        Object.hasOwn(updates, key)
          ? `${encodeURIComponent(key)}=${encodeURIComponent(updates[key])}`
          : part,
      ];
    });
  for (const [key, value] of Object.entries(updates))
    if (!used.has(key) && !omit.includes(key))
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return parts.join("&");
}
export function signRequest(input: SignInput): string {
  const url = new URL(input.templateUrl),
    oldG = url.searchParams.get("X-Gnarly"),
    oldD = url.searchParams.get("X-Dynosaur");
  if (!oldG || !oldD || url.searchParams.get("X-Bogus") !== "1")
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "此接口签名组合尚未实现，已保留请求样本",
    );
  let g: Record<number, string | number>,
    d: Record<number, string | number>,
    gRecords: SignatureRecord[],
    dRecords: SignatureRecord[];
  try {
    g = decodeGnarly(oldG);
    d = decodeDynosaur(oldD);
    gRecords = readRecords(unpackSignature(oldG).payload, true);
    dRecords = readRecords(unpackSignature(oldD).payload, false);
  } catch {
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "签名格式变化，需要重新分析字段和加密布局",
    );
  }
  if (
    g[9] !== "5.3.2" ||
    d[42] !== "5.3.2" ||
    g[10] !== "2.0.0.561" ||
    gRecords.length !== 17 ||
    dRecords.length !== 25
  )
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "当前独立实现仅针对已观察的 5.3.2 / 2.0.0.561 签名版本",
    );
  // Prove the input ordering against the captured request before generating anything.
  if (
    md5(rawQuery(url, ["X-Bogus", "X-Gnarly"])) !== g[3] ||
    fnvHash(rawQuery(url, [...signatures, "msToken"])) !== d[46]
  )
    throw new SpiderError(
      "RESEARCH_REQUIRED",
      "签名输入序列化与捕获样本不一致",
    );
  const base = rawQuery(url, [...signatures, "msToken"], input.updates),
    now = input.now ?? Date.now(),
    ts = Math.floor(now / 1000),
    // Live captures across many requests proved field 8 is stable within this
    // browser session; regenerating it as a timestamp breaks that identity.
    f8 = Number(g[8]),
    count = input.counter ?? 1;
  const env = Number(d[38]);
  for (const [tag, value] of [
    [36, field14(env, ts, Number(d[52]))],
    [37, Number(d[37]) + count],
    [39, ts],
    [47, Number(d[47]) + count],
  ] as const)
    replaceField(dRecords, tag, encodeField(value));
  const hashBuffer = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  replaceField(dRecords, 43, hashBuffer(fnvHash("")));
  replaceField(dRecords, 46, hashBuffer(fnvHash(base)));
  replaceField(dRecords, 48, hashBuffer(fnvHash(input.userAgent)));
  replaceField(dRecords, 32, Buffer.from([94, 222, 223, 224, 0, 1]));
  const checksum = dRecords.reduce((a, r) => a ^ r.value[1], 0);
  replaceField(dRecords, 32, encodeField(checksum, true));
  const dyno = packSignature(writeRecords(dRecords, false));
  const query = `${base}&X-Dynosaur=${encodeURIComponent(dyno)}&msToken=${encodeURIComponent(input.msToken ?? url.searchParams.get("msToken") ?? "")}`;
  const values: Record<number, string | number> = {
    ...g,
    3: md5(query),
    4: md5(""),
    5: md5(input.userAgent),
    6: ts,
    8: f8,
    12: Number(g[12]) + count,
    13: Number(g[13]) + count,
    14: field14(Number(g[1]), ts, f8),
    15: u32(
      (((Number(g[7]) & 65535) ^ (f8 >>> 16)) << 16) |
        ((ts & 65535) ^ (f8 & 65535)),
    ),
  };
  delete values[0];
  delete values[16];
  values[16] = Object.values(values).reduce<number>(
    (x, v) => u32(x ^ (typeof v === "number" ? v : stringWord(v))),
    0,
  );
  values[0] = xorIntegers(values);
  for (const [key, v] of Object.entries(values))
    replaceField(
      gRecords,
      Number(key),
      typeof v === "number" ? intBuffer(v) : Buffer.from(v),
    );
  const gnarly = packSignature(writeRecords(gRecords, true));
  return `${url.origin}${url.pathname}?${query}&X-Bogus=1&X-Gnarly=${encodeURIComponent(gnarly)}`;
}
