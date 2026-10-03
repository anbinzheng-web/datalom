import { managementToken } from '@datalom/shared/runtime/config';
import { schemas } from './openapi/schemas.js';
import { repositoryRoot } from '@datalom/shared/runtime/paths';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import staticFiles from '@fastify/static';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CookieJar } from 'tough-cookie';
import { Store } from '@datalom/shared/storage/store';
import { DatalomError, safeError } from '@datalom/shared/runtime/contracts';

import { HttpTransport } from '@datalom/network-node/transport';
import {
  accountProxy,
  checkProxy,
  openAccountRoute,
  ProxyCheckError,
} from '@datalom/network-node/proxy-check';
import { checkStoredSession } from '@datalom/network-node/session-check';

import { errorRecord, type Trace } from '@datalom/shared/runtime/diagnostics';

const string = { type: 'string' };
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: string },
  additionalProperties: false,
};
export async function authToken(_store: Store): Promise<string> {
  return managementToken();
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
  const token = await authToken(store),
    matches = (candidate: string) => {
      const a = Buffer.from(candidate),
        b = Buffer.from(token);
      return Boolean(token) && a.length === b.length && timingSafeEqual(a, b);
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
      const admin = await store.userForSession(candidate);
      if (!matches(candidate) && admin?.role !== 'admin')
        return reply.code(401).send({
          error: {
            code: 'AUTH_REQUIRED',
            message: '请先登录',
          },
        });
    }
  });
  app.setErrorHandler(async (error, req, reply) => {
    const diagnosticId = await store.diagnostics.event(
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
      await store.diagnostics.event({ requestId: req.id }, 'management', 'started', {
        route: req.routeOptions.url,
        method: req.method,
        params: req.params,
        body: req.body,
      });
  });
  app.addHook('onResponse', async (req, reply) => {
    if (!existing)
      store.observations.record(
        `${req.method} ${req.routeOptions.url ?? 'unmatched'}`,
        String(reply.statusCode),
        reply.elapsedTime,
      );
    if ((req.method !== 'GET' || reply.statusCode >= 400) && req.url.startsWith('/api/'))
      await store.diagnostics.event({ requestId: req.id }, 'management', 'completed', {
        route: req.routeOptions.url,
        method: req.method,
        status: reply.statusCode,
        durationMs: reply.elapsedTime,
      });
  });
  if (!existing)
    app.get('/api/health', { schema: { response: { 200: schemas.Health } } }, async () => ({
      ok: true,
      version: '0.1.0',
    }));
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
        const session = await store.signInWithPassword(
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
      return await store.signInWithProvider({
        provider: body.provider,
        subject: String(body.subject ?? ''),
        email: String(body.email ?? ''),
        name: body.name,
        avatarUrl: body.avatarUrl,
      });
    } catch (error) {
      const safe = safeError(error);
      return reply
        .code(safe.code === 'CONFLICT' ? 403 : 400)
        .send({ error: { message: safe.message } });
    }
  });
  app.get('/api/auth/session', async (req) => {
    const id = String((req.query as { id?: string }).id ?? '');
    return { user: await store.userForSession(id) };
  });
  app.delete('/api/auth/session', async (_req, reply) => {
    // Stateless logout clears this browser; copied JWTs expire or are revoked together.
    reply.header('Set-Cookie', 'datalom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
  app.get('/api/users', async () => ({ users: await store.listUsers() }));
  app.get('/api/whitelist', async () => ({ emails: await store.listAllowedEmails() }));
  app.post('/api/whitelist', async (req, reply) => {
    const body = req.body as { email?: string };
    try {
      await store.allowEmail(String(body?.email ?? ''));
      return { emails: await store.listAllowedEmails() };
    } catch (error) {
      return reply.code(400).send({ error: { message: safeError(error).message } });
    }
  });
  app.post('/api/whitelist/remove', async (req) => {
    await store.removeAllowedEmail(String((req.body as { email?: string })?.email ?? ''));
    return { emails: await store.listAllowedEmails() };
  });
  app.post('/api/logout', async (_, reply) => {
    reply.header('Set-Cookie', 'datalom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
  app.get('/api/openapi.json', async () => app.swagger());
  async function listAccounts() {
    return await Promise.all(
      (await store.listAccounts()).map(async (account) => {
        const proxy = accountProxy(await store.getSecret(account.id));
        return {
          ...account,
          proxy: proxy ? { protocol: proxy.protocol, host: proxy.host, port: proxy.port } : null,
          proxyCheck: (await store.getProxyCheck(account.id)) ?? null,
        };
      }),
    );
  }
  app.get('/api/accounts', async () => await listAccounts());
  app.post('/api/accounts/:id/session/check', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    const account = await store.getAccount(id),
      lease = await store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行或冷却，请稍后再试');
    try {
      const secret = await store.getSecret(id);
      const result = await checkStoredSession(secret, account.platform);
      secret.observed.sessionCheck = result;
      await store.saveSecret(
        id,
        account.version,
        secret,
        lease,
        result.status === 'valid' ? result.identity : undefined,
      );
      if (result.status === 'login_required')
        await store.status(id, 'login_required', result.reason);
      else if (result.status === 'valid' && account.status === 'login_required')
        await store.status(id, 'pending', '会话有效，等待采集接口验证');
      return result;
    } finally {
      await store.release(id, lease);
    }
  });
  app.post('/api/accounts/:id/proxy/check', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as { id: string };
    await store.getAccount(id);
    const lease = await store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行、冷却或已禁用');
    try {
      const result = await checkProxy(await store.getSecret(id));
      await store.setProxyCheck(id, result);
      return result;
    } catch (error) {
      if (error instanceof ProxyCheckError) await store.setProxyCheck(id, error.result);
      throw error;
    } finally {
      await store.release(id, lease);
    }
  });
  app.get('/api/accounts/:id/scheduling', { schema: { params: idParams } }, async (req) => ({
    ...(await store.accountPolicy((req.params as { id: string }).id)),
    maxConcurrent: 1,
  }));
  app.get('/api/accounts/:id', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as any,
      a = await store.getAccount(id),
      s = await store.getSecret(id);
    return {
      ...a,
      cookieCount: s.cookies.length,
      proxy: (() => {
        const p = accountProxy(s);
        return p ? { protocol: p.protocol, host: p.host, port: p.port } : null;
      })(),
      proxyCheck: (await store.getProxyCheck(id)) ?? null,
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
            status: { enum: ['disabled', 'pending'] },
          },
        },
      },
    },
    async (req) => {
      await store.patchAccount((req.params as any).id, req.body as any);
      return { ok: true };
    },
  );
  app.post('/api/accounts/:id/route/verify', { schema: { params: idParams } }, async (req) => {
    const { id } = req.params as any,
      a = await store.getAccount(id),
      lease = await store.lease(id, true);
    if (!lease) throw new DatalomError('CONFLICT', '账号正在执行、冷却或已禁用');
    let handle;
    const trace: Trace = async (stage, outcome, payload, code) => {
      await store.diagnostics.event(
        { accountId: id, requestId: req.id, sessionVersion: a.version },
        stage,
        outcome,
        payload,
        code,
      );
    };
    try {
      const s = await store.getSecret(id);
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
      await store.saveSecret(id, a.version, s, lease);
      await store.evidence(
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
      await store.release(id, lease);
    }
  });
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
