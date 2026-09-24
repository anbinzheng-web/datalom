import { describe, it, expect } from "vitest";
import { buildApp, authToken } from "../apps/server/src/app.ts";
import { fixture } from "./helpers.ts";
describe("local API", () => {
  it("requires auth and rejects remote origins and DNS rebinding hosts", async () => {
    const f = fixture(),
      app = await buildApp(f.store);
    try {
      expect((await app.inject("/api/accounts")).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${authToken(f.store)}` };
      expect(
        (await app.inject({ url: "/api/accounts", headers })).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            url: "/api/accounts",
            headers: { ...headers, origin: "https://evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: "/api/accounts",
            headers: { ...headers, host: "evil.example" },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
      f.cleanup();
    }
  });
  it("supports HttpOnly login, masks secrets and generates OpenAPI", async () => {
    const f = fixture(),
      app = await buildApp(f.store);
    try {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth",
        payload: { token: authToken(f.store) },
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers["set-cookie"]).toContain("HttpOnly");
      const headers = {
        cookie: String(login.headers["set-cookie"]).split(";")[0],
      };
      const detail = await app.inject({
        url: `/api/accounts/${f.account.id}`,
        headers,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.body).not.toContain("secret-cookie-fixture");
      expect(detail.body).not.toContain("secret-proxy-fixture");
      const doc = await app.inject({ url: "/api/openapi.json", headers });
      expect(doc.json().paths["/api/tasks"]).toBeTruthy();
    } finally {
      await app.close();
      f.cleanup();
    }
  });
  it("validates video targets, pagination, idempotency and cancellation", async () => {
    const f = fixture(),
      app = await buildApp(f.store),
      headers = { authorization: `Bearer ${authToken(f.store)}` };
    try {
      const input = {
        accountId: f.account.id,
        operation: "video.comments",
        video: "https://evil.example/video/7685551053554617613",
      };
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/tasks",
            headers,
            payload: input,
          })
        ).statusCode,
      ).toBe(400);
      input.video = "7685551053554617613";
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/tasks",
            headers,
            payload: { ...input, maxPages: 1000 },
          })
        ).statusCode,
      ).toBe(400);
      const r = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers,
        payload: { ...input, requestId: "test-idempotency" },
      });
      expect(r.statusCode).toBe(202);
      await app.inject({
        method: "POST",
        url: `/api/tasks/${r.json().id}/cancel`,
        headers,
      });
      expect(f.store.task(r.json().id).status).toBe("cancelled");
    } finally {
      await app.close();
      f.cleanup();
    }
  });
});
