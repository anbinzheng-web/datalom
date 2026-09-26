import { it, expect } from "vitest";
import Ajv from "ajv";
import { apiContract, createDatalomClient } from "@datalom/contracts-ts";
import { buildApp, authToken } from "@datalom/server/app";
import { fixture } from "./helpers.ts";

it("serves task lifecycle responses compatible with the cross-language contract and typed client", async () => {
  const f = fixture();
  const app = await buildApp(f.store);
  const ajv = new Ajv({ strict: false, formats: { int64: true } });
  const validate = ajv.compile(apiContract.components.schemas.Task);
  try {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const client = createDatalomClient({
      baseUrl: address,
      headers: { Authorization: `Bearer ${authToken(f.store)}` },
    });
    const body = {
      accountId: f.account.id,
      operation: "video.detail" as const,
      video: "7685551053554617613",
      requestId: "contract-fixture",
      deadline: Date.now() + 60000,
    };
    const submitted = await client.POST("/api/tasks", { body });
    expect(submitted.response.status).toBe(202);
    expect(validate(submitted.data), JSON.stringify(validate.errors)).toBe(
      true,
    );
    expect(submitted.data).not.toHaveProperty("lease");
    const repeated = await client.POST("/api/tasks", { body });
    expect(repeated.data?.id).toBe(submitted.data?.id);
    const conflict = await client.POST("/api/tasks", {
      body: { ...body, video: "7685551053554617614" },
    });
    expect(conflict.response.status).toBe(409);
    const params = { path: { id: submitted.data!.id } };
    expect(
      (await client.POST("/api/tasks/{id}/cancel", { params })).data?.ok,
    ).toBe(true);
    const found = await client.GET("/api/tasks/{id}", { params });
    expect(validate(found.data), JSON.stringify(validate.errors)).toBe(true);
    expect(found.data?.cancelled).toBe(1);
    const list = await client.GET("/api/tasks");
    expect(list.data?.every((task) => validate(task))).toBe(true);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${authToken(f.store)}` },
      payload: { ...body, count: 51 },
    });
    expect(invalid.statusCode).toBe(400);
  } finally {
    await app.close();
    f.cleanup();
  }
});
