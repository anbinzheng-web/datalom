process.env.DATALOM_ACCOUNT_INTERVAL_MS = '0';
process.env.DATALOM_MANAGEMENT_TOKEN = 'test-management-token-only-32-characters';
import { testStore } from '@datalom/shared/storage/testing';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Store } from '@datalom/shared/storage/store';
import { Vault } from '@datalom/shared/storage/crypto';
import { AppModule } from '../dist/app.module.js';
import { PublicApiService, sanitize } from '../dist/public-api/public-api.service.js';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { EventEmitter } from 'node:events';
import { publicSpecification } from '../dist/openapi/public.js';
import { authToken } from '../dist/app.js';
const dir = mkdtempSync(join(tmpdir(), 'datalom-public-'));
const isolated = await testStore(dir);
const store = isolated.store;
const oldKey = process.env.DATALOM_PUBLIC_API_KEY,
  oldRpm = process.env.DATALOM_PUBLIC_API_RPM;
process.env.DATALOM_PUBLIC_API_KEY = randomBytes(32).toString('hex');
process.env.DATALOM_PUBLIC_API_RPM = '100';
let app;
try {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Store)
    .useValue(store)
    .compile();
  app = module.createNestApplication(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const api = module.get(PublicApiService);
  const headers = {
    host: 'api.example.com',
    authorization: `Bearer ${process.env.DATALOM_PUBLIC_API_KEY}`,
  };
  const url = '/api/v1/tiktok/web/user/posts?sec_uid=example';
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal(
    (await app.inject({ url, headers: { authorization: `Bearer ${await authToken(store)}` } }))
      .statusCode,
    401,
  );
  assert.equal((await app.inject({ url: '/api/accounts', headers })).statusCode, 403);
  assert.equal(
    (await app.inject({ url: '/api/accounts', headers: { authorization: headers.authorization } }))
      .statusCode,
    401,
  );
  const spec = await app.inject({ url: '/api/v1/openapi.json', headers });
  assert.equal(spec.statusCode, 200);
  assert.deepEqual(
    Object.keys(spec.json().paths).sort(),
    Object.keys(publicSpecification().paths).sort(),
  );
  assert.ok(!spec.json().paths['/api/accounts']);
  for (const path of [
    '/api/v1/instagram/web/profile/detail?user_id=123',
    '/api/v1/facebook/web/page/header?user_id=123',
    '/api/v1/x/web/profile/detail?username=example',
    '/api/v1/youtube/web/video/detail?video_id=dQw4w9WgXcQ',
  ]) {
    assert.equal((await app.inject({ url: path })).statusCode, 401, path);
    assert.equal((await app.inject({ url: path, headers })).statusCode, 503, path);
    assert.equal(
      (await app.inject({ url: path + '&cookie=secret', headers })).statusCode,
      400,
      path,
    );
  }
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/doubao/web/chat/completion',
        headers,
        payload: { prompt: 'hello' },
      })
    ).statusCode,
    503,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/doubao/web/chat/completion',
        headers,
        payload: { prompt: 'hello', session_id: 'other' },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ url: '/api/v1/x/web/profile/detail?username=invalid-name', headers }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: '/api/v1/instagram/web/post/comments?media_id=123&count=31',
        headers,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ url: '/api/v1/facebook/web/page/header?user_id=123&cursor=abc', headers }))
      .statusCode,
    400,
  );
  const unavailable = await app.inject({ url, headers });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error.code, 'NO_AVAILABLE_ACCOUNT');
  assert.equal(unavailable.headers['x-request-id'], unavailable.json().request_id);
  for (const path of [
    'user/posts?sec_uid=x&count=51',
    'user/posts?sec_uid=x&url=https://evil.invalid',
    'user/detail',
    'video/detail?video_id=abc',
    'user/posts?sec_uid=x&count=2&count=3',
    'search/videos?keyword=test&cursor=abc',
    'user/posts?sec_uid=x&cursor=tampered',
  ])
    assert.equal(
      (await app.inject({ url: `/api/v1/tiktok/web/${path}`, headers })).statusCode,
      400,
      path,
    );
  const execute = api.execute.bind(api);
  const calls = [];
  api.execute = async (options) => {
    calls.push(options);
    return { request_id: options.auth.id, data: { status_code: 0 } };
  };
  for (const path of [
    'user/detail?username=test',
    'user/posts?sec_uid=test',
    'video/detail?video_id=123456789012345',
    'video/comments?video_id=123456789012345',
    'comment/replies?video_id=123456789012345&comment_id=123',
    'search/videos?keyword=test',
  ]) {
    assert.equal(
      (await app.inject({ url: `/api/v1/tiktok/web/${path}`, headers })).statusCode,
      200,
      path,
    );
  }
  assert.equal(calls[0].parameters.uniqueId, 'test');
  assert.equal(calls[3].parameters.aweme_id, '123456789012345');
  assert.equal(calls[4].parameters.item_id, '123456789012345');
  assert.equal(calls[5].parameters.offset, '0');
  api.execute = execute;
  assert.deepEqual(sanitize({ comments: [{ text: 'ok', msToken: 'secret' }], cookie: 'secret' }), {
    comments: [{ text: 'ok' }],
  });
  // Cursor confidentiality, integrity, query binding and expiry.
  const key = randomBytes(32);
  const token = api.encode(
    {
      account: 'secret-account',
      operation: 'tiktok:user.posts',
      subject: 'subject',
      cursor: '20',
      expires: Date.now() + 10000,
    },
    key,
  );
  assert.equal(api.decode(token, key).cursor, '20');
  assert.throws(() => api.decode(token, randomBytes(32)));
  assert.ok(!Buffer.from(token, 'base64url').toString().includes('secret-account'));
  const account = await store.importAccount(
    {
      platform: 'tiktok',
      profileId: 'fixture',
      workspaceId: 'fixture',
      label: 'fixture',
      identity: 'fixture',
    },
    {
      cookies: [],
      storage: { origins: [], session: {} },
      configured: {},
      observed: {
        userAgent: 'test',
        browserVersion: 'test',
        language: 'en',
        languages: ['en'],
        timezone: 'UTC',
      },
    },
  );
  await store.status(account.id, 'ready');
  let closed = 0;
  api.open = async () => ({
    transport: {},
    save() {},
    async close() {
      closed++;
    },
  });
  const raw = new EventEmitter();
  raw.writableEnded = false;
  const args = {
    auth: { id: 'request-fixture', key },
    req: {},
    reply: { raw },
    platform: 'tiktok',
    operation: 'user.posts',
    parameters: { secUid: 'subject' },
    paginated: true,
    template: () => ({
      url: 'https://www.tiktok.com/api/post/item_list/',
      headers: {},
      capturedAt: 1,
    }),
    run: async (_template, context, cursor) => {
      assert.equal(
        await store.lease(account.id),
        null,
        'worker cannot lease an active API account',
      );
      await context.saveSession();
      return {
        raw: { status_code: 0, cookie: 'secret' },
        cursor: cursor === '0' ? '20' : '40',
        hasMore: true,
      };
    },
  };
  const page = await api.execute(args);
  assert.deepEqual(page.data, { status_code: 0 });
  assert.ok(page.pagination.next_cursor);
  const next = await api.execute({ ...args, cursor: page.pagination.next_cursor });
  assert.equal(api.decode(next.pagination.next_cursor, key).cursor, '40');
  await assert.rejects(
    api.execute({
      ...args,
      parameters: { secUid: 'another' },
      cursor: page.pagination.next_cursor,
    }),
    (e) => e.getStatus() === 400,
  );
  const expired = api.encode(
    {
      account: account.id,
      operation: 'tiktok:user.posts',
      subject: 'irrelevant',
      cursor: '20',
      expires: 0,
    },
    key,
  );
  await assert.rejects(api.execute({ ...args, cursor: expired }), (e) => e.getStatus() === 400);
  await assert.rejects(
    api.execute({
      ...args,
      run: async () => {
        throw new DatalomError('RATE_LIMIT', 'secret upstream details');
      },
    }),
    (e) => e.getStatus() === 502 && !JSON.stringify(e.getResponse()).includes('secret upstream'),
  );
  assert.equal((await store.getAccount(account.id)).status, 'cooldown');
  assert.equal(
    (await store.sql.one('SELECT lease FROM platform_sessions WHERE "accountId"=$1', account.id)).lease,
    null,
  );
  assert.equal(closed, 3);
  assert.equal(raw.listenerCount('close'), 0);
  let managedReleased = 0;
  const managedArgs = {
    auth: { id: 'managed', key },
    reply: { raw },
    platform: 'x',
    operation: 'profile.posts',
    parameters: { userId: '123' },
    paginated: true,
    acquire: (pinned) => {
      assert.ok(!pinned || pinned === 'profile');
      return {
        account: 'profile',
        renew: () => true,
        release: () => {
          managedReleased++;
        },
        run: async () => ({ raw: { items: [] }, cursor: 'next', hasMore: true }),
      };
    },
  };
  const managedPage = await api.executeManaged(managedArgs);
  await api.executeManaged({ ...managedArgs, cursor: managedPage.pagination.next_cursor });
  assert.equal(managedReleased, 2);
  await assert.rejects(
    api.executeManaged({
      ...managedArgs,
      platform: 'facebook',
      cursor: managedPage.pagination.next_cursor,
    }),
    (e) => e.getStatus() === 400,
  );
  await assert.rejects(
    api.executeManaged({
      ...managedArgs,
      acquire: () => ({
        account: 'profile',
        renew: () => true,
        release: (cooldown) => {
          assert.equal(cooldown, 300000);
          managedReleased++;
        },
        run: async () => {
          throw new DatalomError('RATE_LIMIT', 'private');
        },
      }),
    }),
    (e) => e.getStatus() === 502,
  );
  assert.equal(managedReleased, 3);
  process.env.DATALOM_PUBLIC_API_RPM = '1';
  const limited = await app.inject({ url, headers });
  assert.equal(limited.statusCode, 429);
  assert.ok(limited.headers['retry-after']);
  delete process.env.DATALOM_PUBLIC_API_KEY;
  assert.equal((await app.inject({ url, headers })).statusCode, 503);
  console.log(
    'Public API routing, auth isolation, quota, input validation, parameter mapping and cursor integrity verified.',
  );
} finally {
  if (app) await app.close();
  await isolated.cleanup();
  if (oldKey === undefined) delete process.env.DATALOM_PUBLIC_API_KEY;
  else process.env.DATALOM_PUBLIC_API_KEY = oldKey;
  if (oldRpm === undefined) delete process.env.DATALOM_PUBLIC_API_RPM;
  else process.env.DATALOM_PUBLIC_API_RPM = oldRpm;
  rmSync(dir, { recursive: true, force: true });
}
