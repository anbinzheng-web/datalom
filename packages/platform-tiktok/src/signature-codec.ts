// Wire-format research references are recorded in packages/platform-tiktok/research/README.md.
// This module has no browser, filesystem or network dependency.
import { createHash, randomBytes } from "node:crypto";
const alphabet =
  "u09tbS3UvgDEe6r-ZVMXzLpsAohTn7mdINQlW412GqBjfYiyk8JORCF5/xKHwacP=";
const standard =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const constants = [1196819126, 600974999, 3863347763, 1451689750];
const rot = (v: number, n: number) => ((v << n) | (v >>> (32 - n))) >>> 0;
function block(state: number[], rounds: number) {
  const w = state.slice();
  const q = (a: number, b: number, c: number, d: number) => {
    w[a] = (w[a] + w[b]) >>> 0;
    w[d] = rot(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0;
    w[b] = rot(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0;
    w[d] = rot(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0;
    w[b] = rot(w[b] ^ w[c], 7);
  };
  for (let r = 0; r < rounds;) {
    q(0, 4, 8, 12);
    q(1, 5, 9, 13);
    q(2, 6, 10, 14);
    q(3, 7, 11, 15);
    if (++r >= rounds) break;
    q(0, 5, 10, 15);
    q(1, 6, 11, 12);
    q(2, 7, 12, 13);
    q(3, 4, 13, 14);
    r++;
  }
  return w.map((v, i) => (v + state[i]) >>> 0);
}
function crypt(data: Buffer, key: Buffer): Buffer {
  if (key.length !== 48) throw new Error("Invalid key");
  const words = Array.from({ length: 12 }, (_, i) => key.readUInt32LE(i * 4));
  const rounds = words.reduce((a, v) => (a + (v & 15)) & 15, 0) + 5;
  const state = [...constants, ...words],
    out = Buffer.alloc(data.length);
  for (let offset = 0; offset < data.length; offset += 64) {
    const stream = block(state, rounds);
    state[12] = (state[12] + 1) >>> 0;
    for (let i = 0; i < 64 && offset + i < data.length; i++)
      out[offset + i] =
        data[offset + i] ^
        ((stream[Math.floor(i / 4)] >>> ((i % 4) * 8)) & 255);
  }
  return out;
}
const b64decode = (s: string) =>
  Buffer.from(
    [...s].map((c) => standard[alphabet.indexOf(c)] ?? "").join(""),
    "base64",
  );
const b64encode = (b: Buffer) =>
  [...b.toString("base64")].map((c) => alphabet[standard.indexOf(c)]).join("");
export function unpackSignature(encoded: string): {
  payload: Buffer;
  header: number;
  key: Buffer;
} {
  const raw = b64decode(encoded);
  if (raw.length < 50 || raw[0] !== 75)
    throw new Error("Unsupported signature header");
  const rest = raw.subarray(1),
    length = rest.length - 48;
  const offset = rest.reduce((a, b) => a + b, 0) % (length + 1);
  const key = rest.subarray(offset, offset + 48),
    cipher = Buffer.concat([
      rest.subarray(0, offset),
      rest.subarray(offset + 48),
    ]);
  return { header: raw[0], key, payload: crypt(cipher, key) };
}
export function packSignature(
  payload: Buffer,
  key: Buffer = randomBytes(48),
): string {
  const cipher = crypt(payload, key),
    offset =
      Buffer.concat([key, cipher]).reduce((a, b) => a + b, 0) %
      (cipher.length + 1);
  return b64encode(
    Buffer.concat([
      Buffer.from([75]),
      cipher.subarray(0, offset),
      key,
      cipher.subarray(offset),
    ]),
  );
}
export interface SignatureRecord {
  tag: number;
  value: Buffer;
}
export function readRecords(
  payload: Buffer,
  withCount: boolean,
): SignatureRecord[] {
  const records: SignatureRecord[] = [];
  let p = withCount ? 1 : 0;
  while (p < payload.length) {
    if (p + 3 > payload.length) throw new Error("Truncated signature");
    const tag = payload[p++],
      length = payload.readUInt16BE(p);
    p += 2;
    if (
      length > 4096 ||
      p + length > payload.length ||
      records.some((r) => r.tag === tag)
    )
      throw new Error("Unsupported signature layout");
    records.push({ tag, value: Buffer.from(payload.subarray(p, p + length)) });
    p += length;
  }
  if (withCount && records.length !== payload[0])
    throw new Error("Signature field count mismatch");
  return records;
}
export function writeRecords(
  records: SignatureRecord[],
  withCount: boolean,
): Buffer {
  const list = records.map((r) => {
    const prefix = Buffer.alloc(3);
    prefix[0] = r.tag;
    prefix.writeUInt16BE(r.value.length, 1);
    return Buffer.concat([prefix, r.value]);
  });
  return Buffer.concat([
    ...(withCount ? [Buffer.from([records.length])] : []),
    ...list,
  ]);
}
export const intBuffer = (n: number) => {
  n = n >>> 0;
  const b = Buffer.alloc(n < 65025 ? 2 : 4);
  b.writeUIntBE(n, 0, b.length);
  return b;
};
export const md5 = (s: string) => createHash("md5").update(s).digest("hex");
export function fnvHash(s: string): number {
  let h = 2166136260;
  for (const b of Buffer.from(s)) {
    const p = Math.imul(h ^ b, 16777619) >>> 0;
    h = Math.imul(p, 33) >>> 0;
  }
  return h;
}
export function encodeField(value: string | number, nonce = false): Buffer {
  const text = String(value),
    out = Buffer.alloc(Math.max(text.length, 4) + 2);
  for (let i = 0; i < text.length; i++) {
    let v = nonce
      ? ((text.charCodeAt(i) ^ (102 + i)) + (i & 170)) ^ 165
      : (text.charCodeAt(i) ^ (103 + i)) + ((i & 170) + 1);
    v = nonce ? (v << 1) + ((v << 1) >> 8) : (v << 2) + ((v << 2) >> 8);
    out[i] = nonce ? (v & 255) ^ 187 : (((v & 255) ^ 187) + 1) & 255;
  }
  for (let i = text.length; i < 4; i++) out[i] = 221 + i;
  out.writeUInt16BE(text.length, out.length - 2);
  return out;
}
export function decodeField(value: Buffer, nonce = false): string {
  const length = value.readUInt16BE(value.length - 2);
  if (length > value.length - 2) throw new Error("Unsupported encoded field");
  let result = "";
  for (let i = 0; i < length; i++) {
    let found = false;
    for (let c = 32; c < 127; c++) {
      let v = nonce
        ? ((c ^ (102 + i)) + (i & 170)) ^ 165
        : (c ^ (103 + i)) + ((i & 170) + 1);
      v = nonce ? (v << 1) + ((v << 1) >> 8) : (v << 2) + ((v << 2) >> 8);
      const b = nonce ? (v & 255) ^ 187 : (((v & 255) ^ 187) + 1) & 255;
      if (b === value[i]) {
        result += String.fromCharCode(c);
        found = true;
        break;
      }
    }
    if (!found) throw new Error("Unsupported field encoding");
  }
  return result;
}
export function decodeGnarly(value: string): Record<number, string | number> {
  const records = readRecords(unpackSignature(value).payload, true);
  const stringFields = [3, 4, 5, 9, 10];
  return Object.fromEntries(
    records.map((r) => [
      r.tag,
      stringFields.includes(r.tag)
        ? r.value.toString()
        : r.value.readUIntBE(0, r.value.length),
    ]),
  );
}
export function decodeDynosaur(value: string): Record<number, string | number> {
  return Object.fromEntries(
    readRecords(unpackSignature(value).payload, false).map((r) => [
      r.tag,
      [43, 46, 48, 56].includes(r.tag)
        ? r.value.readUInt32BE()
        : r.tag === 53
          ? `opaque:${r.value.toString("hex")}`
          : decodeField(r.value, [32, 33, 34].includes(r.tag)),
    ]),
  );
}
