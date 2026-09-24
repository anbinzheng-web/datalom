// Algorithm adapted from x-client-transaction-id 0.3.1 (MIT, Lami).
// See vendor/LICENSE-x-client-transaction-id. No remote code is executed.
import { createHash, randomBytes } from "node:crypto";
import { parseHTML } from "linkedom";
import { SpiderError } from "../../core/contracts.ts";
const fail = (m: string): never => {
  throw new SpiderError("RESEARCH_REQUIRED", m);
};
export function resolveTransactionScript(html: string) {
  const match =
    /(\d+):\s*["']ondemand\.s["'][\s\S]*?\}\)\[e\]\s*\|\|\s*e\)\s*\+\s*["']\.["']\s*\+\s*\(\{[\s\S]*?\b\1:\s*["']([a-zA-Z0-9_-]+)["']/s.exec(
      html,
    );
  if (!match) return fail("无法从页面 runtime 解析 transaction chunk");
  return `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${match[2]}a.js`;
}
function cubic(c: number[], time: number) {
  const calc = (a: number, b: number, m: number) =>
    3 * a * (1 - m) ** 2 * m + 3 * b * (1 - m) * m * m + m ** 3;
  if (time <= 0)
    return (
      (c[0] > 0 ? c[1] / c[0] : c[1] === 0 && c[2] > 0 ? c[3] / c[2] : 0) * time
    );
  if (time >= 1)
    return (
      1 +
      (c[2] < 1
        ? (c[3] - 1) / (c[2] - 1)
        : c[2] === 1 && c[0] < 1
          ? (c[1] - 1) / (c[0] - 1)
          : 0) *
        (time - 1)
    );
  let low = 0,
    high = 1,
    mid = 0;
  for (let i = 0; i < 80; i++) {
    mid = (low + high) / 2;
    const x = calc(c[0], c[2], mid);
    if (Math.abs(time - x) < 0.00001) return calc(c[1], c[3], mid);
    if (x < time) low = mid;
    else high = mid;
  }
  return calc(c[1], c[3], mid);
}
export class XTransaction {
  constructor(
    private key: Buffer,
    private animationKey: string,
  ) {}
  static fromSources(html: string, script: string) {
    const document = parseHTML(html).document;
    const encoded = document
      .querySelector('[name="twitter-site-verification"]')
      ?.getAttribute("content");
    if (!encoded || !/^[-+/\w]+=*$/.test(encoded))
      return fail("缺少 site verification key");
    const key = Buffer.from(encoded, "base64");
    const indices = [...script.matchAll(/\(\w\[(\d{1,2})\],\s*16\)/g)].map(
      (m) => Number(m[1]),
    );
    if (indices.length < 2 || indices.some((i) => i >= key.length))
      return fail("transaction indices 结构变化");
    const frames = document.querySelectorAll('[id^="loading-x-anim"]');
    const path =
      frames[key[5] % 4]?.children[0]?.children[1]?.getAttribute("d");
    if (!path) return fail("页面缺少 transaction SVG frame");
    const rows = path
      .slice(9)
      .split("C")
      .map((x) =>
        x
          .replace(/[^\d]+/g, " ")
          .trim()
          .split(/\s+/)
          .map(Number),
      );
    const frame = rows[key[indices[0]] % 16];
    if (!frame || frame.length !== 11 || frame.some((x) => !Number.isFinite(x)))
      return fail("transaction frame 结构变化");
    const time =
      (Math.round(
        indices.slice(1).reduce((n, i) => n * (key[i] % 16), 1) / 10,
      ) *
        10) /
      4096;
    const solve = (v: number, min: number, max: number, round: boolean) =>
      round
        ? Math.floor((v * (max - min)) / 255 + min)
        : Math.round(((v * (max - min)) / 255 + min) * 100) / 100;
    const factor = cubic(
      frame.slice(7).map((v, i) => solve(v, i % 2 ? -1 : 0, 1, false)),
      time,
    );
    const color = frame.slice(0, 3).map((v, i) =>
      Math.round(
        // CSS RGB channels clamp at both bounds when easing overshoots.
        Math.min(255, Math.max(0, v * (1 - factor) + frame[i + 3] * factor)),
      ).toString(16),
    );
    const angle = (solve(frame[6], 60, 360, true) * factor * Math.PI) / 180;
    const matrix = [
      Math.cos(angle),
      -Math.sin(angle),
      Math.sin(angle),
      Math.cos(angle),
    ].map((v) => Math.abs(Math.round(v * 100) / 100).toString(16));
    const animation = [...color, ...matrix, "0", "0"]
      .join("")
      .replace(/[.-]/g, "");
    if (!animation || /NaN|Infinity/.test(animation))
      return fail("transaction animation 非有限值");
    return new XTransaction(key, animation);
  }
  generate(
    method: string,
    path: string,
    time = Math.floor((Date.now() - 1682924400000) / 1000),
    mask = randomBytes(1)[0],
  ) {
    if (
      !["GET", "POST"].includes(method) ||
      !path.startsWith("/") ||
      path.includes("?")
    )
      throw new SpiderError(
        "INVALID_INPUT",
        "transaction 必须使用最终 method/path",
      );
    const t = Buffer.alloc(4);
    t.writeUInt32LE(time >>> 0);
    const hash = createHash("sha256")
      .update(`${method}!${path}!${time}obfiowerehiring${this.animationKey}`)
      .digest()
      .subarray(0, 16);
    return Buffer.from([
      mask,
      ...Buffer.concat([this.key, t, hash, Buffer.from([3])]).map(
        (v) => v ^ mask,
      ),
    ])
      .toString("base64")
      .replace(/=/g, "");
  }
}
