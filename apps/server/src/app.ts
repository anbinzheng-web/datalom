import { schemas } from './openapi/schemas.js';
import { repositoryRoot } from '@datalom/shared/runtime/paths';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import staticFiles from '@fastify/static';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CookieJar } from 'tough-cookie';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError, safeError } from '@datalom/shared/runtime/contracts';

import { HttpTransport } from '@datalom/network-node/transport';
import { accountProxy, checkProxy, openAccountRoute } from '@datalom/network-node/proxy-check';
import { checkStoredSession } from '@datalom/network-node/session-check';
import { normalizeVideo } from '@datalom/platform-tiktok/adapter';

import { errorRecord, type Trace } from '@datalom/shared/runtime/diagnostics';

const string = { type: 'string' };
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: string },
  additionalProperties: false,
};
export function authToken(store: Store): string {
  let token = store.getSetting<string>('auth');
  if (!token) {
    token = randomBytes(32).toString('base64url');
    store.setSetting('auth', token);
  }
  return token;
}
export async function buildApp(
  store: Store,
  options: { logger?: boolean } = {},
  existing?: FastifyInstance,
) {
  const app =
    existing ??
    Fastify({
      genReqId: () => randomUUID(),
      logger: options.logger
        ? {
            level: 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
            serializers: {
              req: (r: any) => ({ method: r.method, url: r.url?.split('?')[0] }),
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
      info: { title: 'Datalom local API', version: '0.1.0' },
      components: {
        securitySchemes: { localToken: { type: 'http', scheme: 'bearer' } },
      },
      security: [{ localToken: [] }],
    },
  });
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
      return reply.code(403).send({ error: { code: 'INVALID_INPUT', message: '仅允许本机访问' } });
    const origin = req.headers.origin;
    if (origin) {
      let u: URL;
      try {
        u = new URL(origin);
      } catch {
        return reply.code(403).send({ error: { message: '来源无效' } });
      }
      if (
        !['http:', 'https:'].includes(u.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
        !(
          u.host === host ||
          (host.endsWith(':4317') && u.hostname === '127.0.0.1' && u.port === '4318')
        )
      )
        return reply.code(403).send({ error: { message: '来源不允许' } });
    }
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('Cache-Control', 'no-store');
    const path = req.url.split('?')[0];
    if (
      req.url.startsWith('/api/') &&
      !['/api/auth', '/api/auth/complete', '/api/auth/session', '/api/health'].includes(path)
    ) {
      const cookie =
        req.headers.cookie
          ?.split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith('datalom_session='))
          ?.slice('datalom_session='.length) ?? '';
      const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '';
      const candidate = bearer || decodeURIComponent(cookie);
      const admin = store.userForSession(candidate);
      if (!matches(candidate) && admin?.role !== 'admin')
        return reply.code(401).send({
          error: {
            code: 'AUTH_REQUIRED',
            message: '请先登录',
          },
        });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const diagnosticId = store.diagnostics.event(
      { requestId: req.id },
      'management',
      'failed',
      {
        route: req.routeOptions.url,
        method: req.method,
        params: req.params,
        error: errorRecord(error),
      },
      (error as any).validation ? 'INVALID_INPUT' : safeError(error).code,
    );
    if ((error as any).validation)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: '输入格式不正确，请检查字段',
        },
      });
    const e = safeError(error);
    reply
      .code(e.code === 'CONFLICT' ? 409 : e.code === 'INVALID_INPUT' ? 400 : 502)
      .send({ error: e, diagnosticId, requestId: req.id });
  });
  app.addHook('preHandler', async (req) => {
    if (req.method !== 'GET' && req.routeOptions.url !== '/api/auth')
      store.diagnostics.event({ requestId: req.id }, 'management', 'started', {
        route: req.routeOptions.url,
        method: req.method,
        params: req.params,
        body: req.body,
      });
  });
  app.addHook('onResponse', async (req, reply) => {
    if ((req.method !== 'GET' || reply.statusCode >= 400) && req.url.startsWith('/api/'))
      store.diagnostics.event({ requestId: req.id }, 'management', 'completed', {
        route: req.routeOptions.url,
        method: req.method,
        status: reply.statusCode,
        durationMs: reply.elapsedTime,
      });
  });
  if (!existing)
    app.get(
      '/api/health',
      { schema: { response: { 200: schemas.Health } } },
      async () => ({ ok: true, version: '0.1.0' }),
    );
  app.post(
    '/api/auth',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: { email: string, password: string },
        },
      },
    },
    async (req, reply) => {
      try {
        const session = store.signInWithPassword(
          String((req.body as { email: string }).email),
          String((req.body as { password: string }).password),
        );
        reply.header(
          'Set-Cookie',
          `datalom_session=${session.sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`,
        );
        return { ok: true, user: session.user };
      } catch {
        return reply.code(401).send({ error: { message: '邮箱或密码不正确' } });
      }
    },
  );
  app.post('/api/auth/complete', async (req, reply) => {
    const body = req.body as {
      provider?: string;
      subject?: string;
      email?: string;
      name?: string;
      avatarUrl?: string;
    };
    if (!body || (body.provider !== 'google' && body.provider !== 'github'))
      return reply.code(400).send({ error: { message: '不支持的登录方式' } });
    try {
      return store.signInWithProvider({
        provider: body.provider,
        subject: String(body.subject ?? ''),
        email: String(body.email ?? ''),
        name: body.name,
        avatarUrl: body.avatarUrl,
      });
    } catch (error) {
      const safe = safeError(error);
      return reply.code(safe.code === 'CONFLICT' ? 403 : 400).send({ error: { message: safe.message } });
    }
  });
  app.get('/api/auth/session', async (req) => {
    const id = String((req.query as { id?: string }).id ?? '');
    return { user: store.userForSession(id) };
  });
  app.delete('/api/auth/session', async (req) => {
    store.endSession(String((req.query as { id?: string }).id ?? ''));
    return { ok: true };
  });
  app.get('/api/users', async () => ({ users: store.listUsers() }));
  app.get('/api/whitelist', async () => ({ emails: store.listAllowedEmails() }));
  app.post('/api/whitelist', async (req, reply) => {
    const body = req.body as { email?: string; note?: string };
    try {
      store.allowEmail(String(body?.email ?? ''), body?.note ?? '');
      return { emails: store.listAllowedEmails() };
    } catch (error) {
      return reply.code(400).send({ error: { message: safeError(error).message } });
    }
  });
  app.post('/api/whitelist/remove', async (req) => {
    store.removeAllowedEmail(String((req.body as { email?: string })?.email ?? ''));
    return { emails: store.listAllowedEmails() };
  });
  app.post('/api/logout', async (_, reply) => {
    reply.header('Set-Cookie', 'datalom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
  app.get('/api/openapi.json', async () => app.swagger());
  function listAccounts() {
    return store.listAccounts().map((account) => {
      const proxy = accountProxy(store.getSecret(account.id));
      return {
        ...account,
        proxy: proxy ? { protocol: proxy.protocol, host: proxy.host, port: proxy.port } : null,
        proxyCheck: store.getSetting(`proxy-check:${account.id}`) ?? null,
      };
    });
  }
  app.get('/api/accounts', async () => listAccounts());
  app.post('/api/accounts/:id/session/check', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    const account = store.getAccount(id),
      lease = store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行或冷却，请稍后再试');
    try {
      const secret = store.getSecret(id);
      const result = await checkStoredSession(secret, account.platform);
      secret.observed.sessionCheck = result;
      store.saveSecret(
        id,
        account.version,
        secret,
        lease,
        result.status === 'valid' ? result.identity : undefined,
      );
      if (result.status === 'login_required') store.status(id, 'login_required', result.reason);
      else if (result.status === 'valid' && account.status === 'login_required')
        store.status(id, 'pending', '会话有效，等待采集接口验证');
      return result;
    } finally {
      store.release(id, lease);
    }
  });
  app.post('/api/accounts/:id/proxy/check', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    store.getAccount(id);
    const lease = store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行、冷却或已禁用');
    try {
      const result = await checkProxy(store.getSecret(id));
      store.setSetting(`proxy-check:${id}`, result);
      return result;
    } catch (error) {
      store.setSetting(`proxy-check:${id}`, { available: false, checkedAt: Date.now() });
      throw error;
    } finally {
      store.release(id, lease);
    }
  });
  app.get('/api/accounts/:id/scheduling', { schema: { params: idParams } }, async (req) => ({
    ...store.accountPolicy((req.params as { id: string }).id),
    maxConcurrent: 1,
  }));
  app.put(
    '/api/accounts/:id/scheduling',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['minIntervalMs'],
          additionalProperties: false,
          properties: { minIntervalMs: { type: 'integer', minimum: 0, maximum: 3600000 } },
        },
      },
    },
    async (req) => {
      const id = (req.params as { id: string }).id;
      store.setAccountPolicy(id, (req.body as { minIntervalMs: number }).minIntervalMs);
      return { ...store.accountPolicy(id), maxConcurrent: 1 };
    },
  );
  app.get('/api/accounts/:id', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as any,
      a = store.getAccount(id),
      s = store.getSecret(id);
    return {
      ...a,
      cookieCount: s.cookies.length,
      proxy: (() => {
        const p = accountProxy(s);
        return p ? { protocol: p.protocol, host: p.host, port: p.port } : null;
      })(),
      proxyCheck: store.getSetting(`proxy-check:${id}`) ?? null,
      observed: s.observed,
      route: s.route
        ? {
            upstream: {
              protocol: s.route.upstream?.protocol,
              host: s.route.upstream?.host,
              port: s.route.upstream?.port,
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
  });
  app.patch(
    '/api/accounts/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 100 },
            notes: { type: 'string', maxLength: 1000 },
            status: { enum: ['disabled', 'pending'] },
          },
        },
      },
    },
    async (req) => {
      store.patchAccount((req.params as any).id, req.body as any);
      return { ok: true };
    },
  );
  app.post('/api/accounts/:id/route/verify', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as any,
      a = store.getAccount(id),
      lease = store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行、冷却或已禁用');
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
      handle = await openAccountRoute(s);
      const t = new HttpTransport(handle.url, new CookieJar(), {}, ['api.ipify.org'], trace);
      const r = await t.request('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(20000),
      });
      let ip: string;
      try {
        ip = JSON.parse(r.body).ip;
      } catch {
        throw new DatalomError('PROXY_UNAVAILABLE', '出口检测返回无效响应');
      }
      if (r.status !== 200 || !ip || !/^[\da-f.:]+$/i.test(ip))
        throw new DatalomError('PROXY_UNAVAILABLE', '无法确认代理出口');
      if (!s.route) s.route = { account: accountProxy(s) as any };
      s.route.observedIp = ip;
      const match = !!s.route!.expectedIp && s.route!.expectedIp === ip;
      s.route!.verifiedAt = match ? Date.now() : undefined;
      store.saveSecret(id, a.version, s, lease);
      store.evidence(
        id,
        'route',
        match
          ? '两跳线路出口与 Profile 记录一致'
          : '两跳线路可达，出口与 Profile 记录不一致或缺少基准',
        { ip, expected: s.route!.expectedIp, match },
      );
      return { ip, expectedIp: s.route!.expectedIp, match };
    } finally {
      await handle?.stop();
      store.release(id, lease);
    }
  });
  for (const operation of ['video.detail', 'video.comments'] as const) {
    app.post(
      `/api/v1/tiktok/${operation === 'video.detail' ? 'video' : 'comments'}`,
      {
        schema: {
          body: schemas.TikTokSubmission,
          response: { 202: schemas.Task },
        },
      },
      async (req, reply) => {
        const { requestId, deadline, ...input } = req.body as any;
        normalizeVideo(input.video);
        if (deadline && (deadline <= Date.now() || deadline > Date.now() + 3600000))
          throw new DatalomError('INVALID_INPUT', '截止时间应在未来一小时内');
        reply.code(202);
        return store.enqueue({ ...input, operation }, requestId, deadline);
      },
    );
  }
  const web = resolve(repositoryRoot, 'dist/web');
  if (existsSync(web)) {
    await app.register(staticFiles, { root: web });
    if (!existing)
      app.setNotFoundHandler((req, reply) =>
        req.url.startsWith('/api/')
          ? reply.code(404).send({ error: { message: '接口不存在' } })
          : reply.sendFile('index.html'),
      );
  }
  return app;
}
