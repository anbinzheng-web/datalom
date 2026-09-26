import { it, expect } from "vitest";
import { XCookies } from "../cookies.ts";
import type { XSession } from "../session.ts";
const make = (): XSession => ({
  profileId: "a".repeat(32),
  capturedAt: 0,
  requestCounter: 0,
  cookies: [
    {
      name: "auth_token",
      value: "login",
      domain: ".x.com",
      path: "/",
      expires: -1,
      secure: true,
      httpOnly: true,
      sameSite: "None",
    },
    {
      name: "part",
      value: "yes",
      domain: ".x.com",
      path: "/",
      expires: -1,
      secure: true,
      httpOnly: true,
      sameSite: "None",
      partitionKey: {
        topLevelSite: "https://x.com",
        hasCrossSiteAncestor: false,
      },
    },
    {
      name: "part",
      value: "wrong",
      domain: ".x.com",
      path: "/",
      expires: -1,
      secure: true,
      httpOnly: true,
      sameSite: "None",
      partitionKey: {
        topLevelSite: "https://other.test",
        hasCrossSiteAncestor: false,
      },
    },
  ],
  storage: { origins: [], session: {} },
  configured: {},
  observed: {
    userAgent: "test",
    browserVersion: "150",
    language: "en",
    languages: ["en"],
    timezone: "UTC",
  },
});
it("isolates matching partitions and preserves metadata through persistence", async () => {
  const s = make(),
    events: any[] = [];
  const jar = new XCookies(s, (_a, b, p) => events.push({ b, p }));
  expect(await jar.getCookieString("https://x.com/i/api/graphql/a/b")).toBe(
    "auth_token=login; part=yes",
  );
  expect(events[0].p.reason).toBe("partition-context-mismatch");
  await jar.update(
    [
      "part=updated; Path=/; Secure; Partitioned; SameSite=None",
      "ct0=new; Path=/; Secure",
    ],
    "https://x.com/i/api/graphql/a/b",
  );
  expect(s.cookies[1].partitionKey).toBeDefined();
  const restored = new XCookies(s, () => {});
  expect(await restored.getCookieString("https://x.com/")).toContain(
    "part=updated",
  );
  expect(await restored.getCookieString("https://x.com/")).toContain("ct0=new");
  await expect(
    restored.getCookieString("https://elsewhere.test/"),
  ).rejects.toThrow();
});
it("keeps same-name partitioned and unpartitioned cookies separate and rejects foreign domains", async () => {
  const s = make(),
    j = new XCookies(s, () => {});
  await j.update(
    [
      "part=normal; Secure; Path=/",
      "intruder=x; Domain=elsewhere.test; Secure",
    ],
    "https://x.com/",
  );
  const h = await j.getCookieString("https://x.com/");
  expect(h).toContain("part=normal");
  expect(h).toContain("part=yes");
  expect(h).not.toContain("intruder");
});
it("honors path and expiry and refuses ambiguous partition semantics", async () => {
  const s = make();
  s.cookies.push(
    { ...s.cookies[0], name: "dead", expires: 1 },
    { ...s.cookies[0], name: "scoped", path: "/only" },
  );
  const j = new XCookies(s, () => {});
  expect(await j.getCookieString("https://x.com/")).not.toContain("dead");
  expect(await j.getCookieString("https://x.com/")).not.toContain("scoped");
  expect(await j.getCookieString("https://x.com/only/path")).toContain(
    "scoped",
  );
  s.cookies[1].partitionKey = { topLevelSite: "https://x.com" };
  expect(() => new XCookies(s, () => {})).toThrow();
  await expect(
    j.update(["x=a; Partitioned"], "https://x.com/"),
  ).rejects.toThrow();
});
