import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { XTransaction, resolveTransactionScript } from "../transaction.ts";
it("binds IDs to method, path, time and randomness without browser state", () => {
  const key = Buffer.from([1, 2, 3, 4, 5, 6]);
  const t = new XTransaction(key, "abc123");
  const id = t.generate("GET", "/i/api/graphql/a/SearchTimeline", 12345, 77);
  const decoded = Buffer.from(id, "base64");
  const bytes = Buffer.from(decoded.subarray(1).map((v) => v ^ decoded[0]));
  expect(bytes.subarray(0, key.length)).toEqual(key);
  expect(bytes.readUInt32LE(key.length)).toBe(12345);
  expect(bytes.subarray(key.length + 4, -1)).toEqual(
    createHash("sha256")
      .update("GET!/i/api/graphql/a/SearchTimeline!12345obfiowerehiringabc123")
      .digest()
      .subarray(0, 16),
  );
  expect(bytes.at(-1)).toBe(3);
  expect(t.generate("GET", "/different", 12345, 77)).not.toBe(id);
  expect(
    t.generate("GET", "/i/api/graphql/a/SearchTimeline", 12346, 77),
  ).not.toBe(id);
  expect(
    t.generate("GET", "/i/api/graphql/a/SearchTimeline", 12345, 78),
  ).not.toBe(id);
});
it("fails closed when assets change", () => {
  expect(() => resolveTransactionScript("<html/>")).toThrow();
  expect(() => XTransaction.fromSources("<html/>", "")).toThrow();
  expect(() =>
    new XTransaction(Buffer.from("a"), "b").generate("GET", "/a?query=1"),
  ).toThrow();
});
it("computes SVG animation in pure JS and parses chunk URL from runtime", () => {
  const key = Buffer.alloc(16, 0);
  const path =
    "M0 0 0 0 " + Array(16).fill("0 0 0 255 255 255 0 0 0 0 0").join("C");
  const frames = Array(4)
    .fill(`<svg id="loading-x-anim"><g><path/><path d="${path}"/></g></svg>`)
    .join("");
  const html = `<meta name="twitter-site-verification" content="${key.toString("base64")}">${frames}`;
  const t = XTransaction.fromSources(html, "(a[0],16)*(a[1],16)");
  expect(t.generate("GET", "/a", 1, 1)).toBe(
    new XTransaction(key, "000100100").generate("GET", "/a", 1, 1),
  );
  const runtime = '7:"ondemand.s"})[e]||e)+"."+({7:"hash123"';
  expect(resolveTransactionScript(runtime)).toBe(
    "https://abs.twimg.com/responsive-web/client-web/ondemand.s.hash123a.js",
  );
});
it("matches official CSS clamping when a negative easing factor exceeds RGB 255", () => {
  // Synthetic public fixture from the failing 2026-09-16 animation row.
  // Exact official JS in Chrome 152 yields rgb(181, 161, 255), not (181, 161, 261).
  const key = Buffer.alloc(48);
  key[15] = 8;
  key[11] = 9;
  key[13] = 4;
  const row = "177 156 248 105 76 36 195 48 92 120 177";
  const path = "M0 0 0 0 " + Array(16).fill(row).join("C");
  const html =
    `<meta name="twitter-site-verification" content="${key.toString("base64")}">` +
    Array(4)
      .fill(`<svg id="loading-x-anim"><g><path/><path d="${path}"/></g></svg>`)
      .join("");
  const transaction = XTransaction.fromSources(
    html,
    "(a[18],16)*(a[15],16)*(a[11],16)*(a[13],16)",
  );
  const officialAnimation =
    "b5a1ff0f33333333333304ccccccccccccc04ccccccccccccc0f33333333333300";
  expect(transaction.generate("GET", "/a", 123, 77)).toBe(
    new XTransaction(key, officialAnimation).generate("GET", "/a", 123, 77),
  );
});
