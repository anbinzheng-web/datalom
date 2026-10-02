import { it, expect } from "vitest";
import { cookieJar } from "@datalom/network-node/cookies";
import { session } from "./helpers.ts";
it("preserves host-only, path, secure, expiry and same-name cookies", () => {
  const s = session();
  s.cookies.push({
    ...s.cookies[0],
    value: "api-only",
    domain: "www.tiktok.com",
    path: "/api",
  });
  s.cookies.push({ ...s.cookies[0], name: "expired", expires: 1 });
  const j = cookieJar(s);
  expect(j.getCookieStringSync("https://www.tiktok.com/api/test")).toBe(
    "sid=api-only; sid=secret-cookie-fixture",
  );
  expect(j.getCookieStringSync("https://other.tiktok.com/api")).toBe(
    "sid=secret-cookie-fixture",
  );
  expect(j.getCookieStringSync("http://www.tiktok.com/")).toBe("");
  expect(j.getCookieStringSync("https://example.com")).toBe("");
});
it("applies Set-Cookie deletion and restores updated jar", () => {
  const s = session(),
    j = cookieJar(s);
  j.setCookieSync(
    "sid=new; Domain=.tiktok.com; Path=/; Secure; HttpOnly",
    "https://www.tiktok.com",
  );
  s.cookieJar = JSON.stringify(j.serializeSync());
  const restored = cookieJar(s);
  expect(restored.getCookieStringSync("https://www.tiktok.com")).toBe(
    "sid=new",
  );
  restored.setCookieSync(
    "sid=; Domain=.tiktok.com; Path=/; Max-Age=0",
    "https://www.tiktok.com",
  );
  expect(restored.getCookieStringSync("https://www.tiktok.com")).toBe("");
});
it("retains and explicitly rejects unsupported partition semantics", () => {
  const s = session();
  s.cookies[0].partitionKey = { topLevelSite: "https://tiktok.com" };
  expect(() => cookieJar(s)).toThrow(/分区/);
  expect(s.cookies[0].partitionKey).toBeTruthy();
});
