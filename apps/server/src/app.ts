import { apiContract } from "@datalom/contracts-ts";
import { repositoryRoot } from "@datalom/runtime-node/paths";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import staticFiles from "@fastify/static";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CookieJar } from "tough-cookie";
import { Store } from "@datalom/storage-node/store";
import {
  DatalomError,
  safeError,
  type RouteConfig,
  type TaskInput,
} from "@datalom/runtime-node/contracts";
import { RoxyConnector, type RoxyConfig } from "@datalom/research-tiktok/roxy";
import { startRoute, validateProxy } from "@datalom/network-node/route";
import { HttpTransport } from "@datalom/network-node/transport";
import { normalizeVideo } from "@datalom/platform-tiktok/adapter";
import { prepareAccount } from "@datalom/research-tiktok/prepare";
import { errorRecord, type Trace } from "@datalom/runtime-node/diagnostics";

const string = { type: "string" };
const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: string },
  additionalProperties: false,
};
const taskBody = apiContract.components.schemas.TaskSubmission;
const defaultConfig: RoxyConfig = {
  host: "http://127.0.0.1:50000",
  workspaceId: "",
  upstream: { protocol: "http", host: "127.0.0.1", port: 7897 },
};
export function authToken(store: Store): string {
  let token = store.getSetting<string>("auth");
  if (!token) {
    token = randomBytes(32).toString("base64url");
    store.setSetting("auth", token);
  }
  return token;
}
export async function buildApp(
  store: Store,
  options: { logger?: boolean } = {},
) {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: options.logger
      ? {
          level: "info",
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
          ],
          serializers: {
            req: (r: any) => ({ method: r.method, url: r.url?.split("?")[0] }),
          },
        }
      : false,
    bodyLimit: 1024 * 1024,
  });
  const token = authToken(store),
    matches = (candidate: string) => {
      const a = Buffer.from(candidate),
        b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    };
  await app.register(swagger, {
    openapi: {
      info: { title: "Datalom local API", version: "0.1.0" },
      components: {
        securitySchemes: { localToken: { type: "http", scheme: "bearer" } },
      },
      security: [{ localToken: [] }],
    },
  });
  app.addHook("onRequest", async (req, reply) => {
    const host = req.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
      return reply
        .code(403)
        .send({ error: { code: "INVALID_INPUT", message: "仅允许本机访问" } });
    const origin = req.headers.origin;
    if (origin) {
      let u: URL;
      try {
        u = new URL(origin);
      } catch {
        return reply.code(403).send({ error: { message: "来源无效" } });
      }
      if (
        !["http:", "https:"].includes(u.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
        !(
          u.host === host ||
          (host.endsWith(":4317") &&
            u.hostname === "127.0.0.1" &&
            u.port === "4318")
        )
      )
        return reply.code(403).send({ error: { message: "来源不允许" } });
    }
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
    if (
      req.url.startsWith("/api/") &&
      !["/api/auth", "/api/health"].includes(req.url.split("?")[0])
    ) {
      const cookie =
        req.headers.cookie
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("datalom_session="))
          ?.slice("datalom_session=".length) ?? "";
      const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : "";
      if (!matches(bearer || cookie))
        return reply.code(401).send({
          error: {
            code: "AUTH_REQUIRED",
            message: "请先使用本机访问令牌登录",
          },
        });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const diagnosticId = store.diagnostics.event(
      { requestId: req.id },
      "management",
      "failed",
      {
        route: req.routeOptions.url,
        method: req.method,
        params: req.params,
        error: errorRecord(error),
      },
      (error as any).validation ? "INVALID_INPUT" : safeError(error).code,
    );
    if ((error as any).validation)
      return reply.code(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "输入格式不正确，请检查字段",
        },
      });
    const e = safeError(error);
    reply
      .code(
        e.code === "CONFLICT" ? 409 : e.code === "INVALID_INPUT" ? 400 : 502,
      )
      .send({ error: e, diagnosticId, requestId: req.id });
  });
  app.addHook("preHandler", async (req) => {
    if (req.method !== "GET" && req.routeOptions.url !== "/api/auth")
      store.diagnostics.event({ requestId: req.id }, "management", "started", {
        route: req.routeOptions.url,
        method: req.method,
        params: req.params,
        body: req.body,
      });
  });
  app.addHook("onResponse", async (req, reply) => {
    if (
      (req.method !== "GET" || reply.statusCode >= 400) &&
      req.url.startsWith("/api/")
    )
      store.diagnostics.event(
        { requestId: req.id },
        "management",
        "completed",
        {
          route: req.routeOptions.url,
          method: req.method,
          status: reply.statusCode,
          durationMs: reply.elapsedTime,
        },
      );
  });
  app.get(
    "/api/health",
    { schema: { response: { 200: apiContract.components.schemas.Health } } },
    async () => ({ ok: true, version: "0.1.0" }),
  );
  app.post(
    "/api/auth",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          additionalProperties: false,
          properties: { token: string },
        },
      },
    },
    async (req, reply) => {
      if (!matches((req.body as any).token))
        return reply.code(401).send({ error: { message: "访问令牌不正确" } });
      reply.header(
        "Set-Cookie",
        `datalom_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
      );
      return { ok: true };
    },
  );
  app.post("/api/logout", async (_, reply) => {
    reply.header(
      "Set-Cookie",
      "datalom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return { ok: true };
  });
  app.get("/api/overview", async () => ({
    accounts: store.listAccounts(),
    tasks: store.listTasks(),
    evidence: store.listEvidence(),
    metrics: store.metrics(),
    workers: store.workers(),
    adapter: {
      version: "tiktok-web@0.1.0",
      status: "implemented",
      signatureVersion: "5.3.2 / 2.0.0.561",
      operations: ["video.detail", "video.comments"],
      productionBrowser: false,
    },
  }));
  app.get("/api/openapi.json", async () => app.swagger());
  app.get("/api/settings", async () => {
    const c = store.getSetting<RoxyConfig>("roxy") ?? defaultConfig;
    return { ...c, apiKey: undefined, hasApiKey: !!c.apiKey };
  });
  app.put(
    "/api/settings",
    {
      schema: {
        body: {
          type: "object",
          required: ["host", "workspaceId", "upstream"],
          additionalProperties: false,
          properties: {
            host: string,
            workspaceId: string,
            apiKey: string,
            upstream: {
              type: "object",
              additionalProperties: false,
              required: ["protocol", "host", "port"],
              properties: {
                protocol: { enum: ["http", "https", "socks5"] },
                host: string,
                port: { type: "integer", minimum: 1, maximum: 65535 },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const c = req.body as RoxyConfig;
      validateProxy(c.upstream);
      new RoxyConnector(c);
      const old = store.getSetting<RoxyConfig>("roxy");
      store.setSetting("roxy", { ...c, apiKey: c.apiKey || old?.apiKey });
      return { ok: true };
    },
  );
  const connector = () =>
    new RoxyConnector(store.getSetting<RoxyConfig>("roxy") ?? defaultConfig);
  app.get("/api/roxy/workspaces", async () => {
    const ws = await connector().workspaces();
    return ws.map((w) => ({
      id: String(w.id),
      name: w.workspaceName ?? w.name ?? String(w.id),
    }));
  });
  app.get("/api/roxy/profiles", async () => connector().profiles());
  app.post(
    "/api/roxy/profiles/:id/extract",
    { schema: { params: idParams } },
    async (req) => {
      const { id } = req.params as any;
      const c = connector();
      const r = await c.extract(id);
      const account = store.importAccount(
        {
          profileId: id,
          workspaceId: c.config.workspaceId,
          label: r.label,
          identity: r.identity,
        },
        r.secret,
      );
      store.evidence(
        account.id,
        "extraction",
        `提取 ${r.secret.cookies.length} 条平台 Cookie；${r.warnings.length} 项待验证`,
        { warnings: r.warnings, observed: r.secret.observed },
      );
      return { account, warnings: r.warnings };
    },
  );
  app.get("/api/accounts", async () => store.listAccounts());
  app.post(
    "/api/accounts/:id/prepare",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          required: ["video"],
          additionalProperties: false,
          properties: { video: { type: "string", maxLength: 2048 } },
        },
      },
    },
    async (req) =>
      prepareAccount(store, (req.params as any).id, (req.body as any).video),
  );
  app.get(
    "/api/accounts/:id",
    { schema: { params: idParams } },
    async (req) => {
      const { id } = req.params as any,
        a = store.getAccount(id),
        s = store.getSecret(id);
      return {
        ...a,
        cookieCount: s.cookies.length,
        observed: s.observed,
        route: s.route
          ? {
              upstream: {
                protocol: s.route.upstream.protocol,
                host: s.route.upstream.host,
                port: s.route.upstream.port,
              },
              account: {
                protocol: s.route.account.protocol,
                host: s.route.account.host,
                port: s.route.account.port,
              },
              expectedIp: s.route.expectedIp,
              observedIp: s.route.observedIp,
              verifiedAt: s.route.verifiedAt,
            }
          : null,
        researchOperations: Object.keys(s.research?.requestTemplates ?? {}),
      };
    },
  );
  app.patch(
    "/api/accounts/:id",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string", minLength: 1, maxLength: 100 },
            notes: { type: "string", maxLength: 1000 },
            status: { enum: ["disabled", "pending"] },
          },
        },
      },
    },
    async (req) => {
      store.patchAccount((req.params as any).id, req.body as any);
      return { ok: true };
    },
  );
  app.post(
    "/api/accounts/:id/route/verify",
    { schema: { params: idParams } },
    async (req) => {
      const { id } = req.params as any,
        a = store.getAccount(id),
        lease = store.lease(id, true);
      if (!lease)
        throw new DatalomError("CONFLICT", "账号正在执行、冷却或已禁用");
      let handle;
      const trace: Trace = (stage, outcome, payload, code) => {
        store.diagnostics.event(
          { accountId: id, requestId: req.id, sessionVersion: a.version },
          stage,
          outcome,
          payload,
          code,
        );
      };
      try {
        const s = store.getSecret(id);
        handle = await startRoute(s.route, store.dir, trace);
        const t = new HttpTransport(
          handle.url,
          new CookieJar(),
          {},
          ["api.ipify.org"],
          trace,
        );
        const r = await t.request("https://api.ipify.org?format=json", {
          signal: AbortSignal.timeout(20000),
        });
        let ip: string;
        try {
          ip = JSON.parse(r.body).ip;
        } catch {
          throw new DatalomError("PROXY_UNAVAILABLE", "出口检测返回无效响应");
        }
        if (r.status !== 200 || !ip || !/^[\da-f.:]+$/i.test(ip))
          throw new DatalomError("PROXY_UNAVAILABLE", "无法确认代理出口");
        s.route!.observedIp = ip;
        const match = !!s.route!.expectedIp && s.route!.expectedIp === ip;
        s.route!.verifiedAt = match ? Date.now() : undefined;
        store.saveSecret(id, a.version, s, lease);
        store.evidence(
          id,
          "route",
          match
            ? "两跳线路出口与 Profile 记录一致"
            : "两跳线路可达，出口与 Profile 记录不一致或缺少基准",
          { ip, expected: s.route!.expectedIp, match },
        );
        return { ip, expectedIp: s.route!.expectedIp, match };
      } finally {
        await handle?.stop();
        store.release(id, lease);
      }
    },
  );
  app.post(
    "/api/tasks",
    {
      schema: {
        body: taskBody,
        response: { 202: apiContract.components.schemas.Task },
      },
    },
    async (req, reply) => {
      const { requestId, deadline, ...input } = req.body as TaskInput & {
        requestId?: string;
        deadline?: number;
      };
      normalizeVideo(input.video);
      if (
        deadline &&
        (deadline <= Date.now() || deadline > Date.now() + 3600000)
      )
        throw new DatalomError("INVALID_INPUT", "截止时间应在未来一小时内");
      reply.code(202);
      return store.enqueue(input, requestId, deadline);
    },
  );
  app.get(
    "/api/tasks",
    {
      schema: {
        response: {
          200: { type: "array", items: apiContract.components.schemas.Task },
        },
      },
    },
    async () => store.listTasks(),
  );
  app.get(
    "/api/tasks/:id",
    {
      schema: {
        params: idParams,
        response: { 200: apiContract.components.schemas.Task },
      },
    },
    async (req) => store.task((req.params as any).id),
  );
  app.get("/api/diagnostics/events", async () => store.diagnostics.events());
  app.get(
    "/api/tasks/:id/diagnostics",
    { schema: { params: idParams } },
    async (req) => store.diagnostics.bundle(store.task((req.params as any).id)),
  );
  app.put(
    "/api/tasks/:id/diagnosis",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "revision",
            "state",
            "certainty",
            "cause",
            "nextExperiment",
            "fix",
          ],
          properties: {
            revision: { type: "integer", minimum: 1 },
            state: {
              type: "string",
              enum: ["open", "investigating", "blocked", "resolved"],
            },
            certainty: {
              type: "string",
              enum: ["unconfirmed", "hypothesis", "confirmed"],
            },
            cause: { type: "string", minLength: 1, maxLength: 8000 },
            nextExperiment: { type: "string", maxLength: 8000 },
            fix: { type: "string", maxLength: 8000 },
            regressionTaskId: { type: "string", maxLength: 100 },
          },
        },
      },
    },
    async (req) =>
      store.diagnostics.update(
        store.task((req.params as any).id),
        req.body as any,
      ),
  );
  app.post(
    "/api/tasks/:id/cancel",
    { schema: { params: idParams } },
    async (req) => {
      store.cancel((req.params as any).id);
      return { ok: true };
    },
  );
  for (const operation of ["video.detail", "video.comments"] as const) {
    app.post(
      `/api/v1/tiktok/${operation === "video.detail" ? "video" : "comments"}`,
      {
        schema: {
          body: apiContract.components.schemas.TikTokSubmission,
          response: { 202: apiContract.components.schemas.Task },
        },
      },
      async (req, reply) => {
        const { requestId, deadline, ...input } = req.body as any;
        normalizeVideo(input.video);
        if (
          deadline &&
          (deadline <= Date.now() || deadline > Date.now() + 3600000)
        )
          throw new DatalomError("INVALID_INPUT", "截止时间应在未来一小时内");
        reply.code(202);
        return store.enqueue({ ...input, operation }, requestId, deadline);
      },
    );
  }
  const web = resolve(repositoryRoot, "dist/web");
  if (existsSync(web)) {
    await app.register(staticFiles, { root: web });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: { message: "接口不存在" } })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
