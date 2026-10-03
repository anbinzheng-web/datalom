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
import { authToken } from '../dist/app.js';

const dir = mkdtempSync(join(tmpdir(), 'datalom-nest-'));
const isolated = await testStore(dir);
const store = isolated.store;
let app;
try {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Store)
    .useValue(store)
    .compile();
  app = module.createNestApplication(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const health = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().ok, true);
  assert.equal((await app.inject({ method: 'GET', url: '/api/accounts' })).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { authorization: `Bearer ${await authToken(store)}` },
      })
    ).statusCode,
    200,
  );
  const rejected = await app.inject({
    method: 'POST',
    url: '/api/auth',
    payload: { email: 'admin@datalom.com', password: 'incorrect' },
  });
  assert.equal(rejected.statusCode, 401);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth',
    payload: { email: 'admin@datalom.com', password: '12345678' },
  });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const sessionId = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie } })).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/api/auth/session?id=${encodeURIComponent(sessionId)}`,
      })
    ).json().user.role,
    'admin',
  );
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/api/auth/session?id=${encodeURIComponent(sessionId)}`,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { cookie: 'datalom_session=' },
      })
    ).statusCode,
    401,
  );
  assert.ok(await store.userForSession(sessionId));
  await store.revokeUserTokens((await store.userForSession(sessionId)).id);
  assert.equal(await store.userForSession(sessionId), null);
  assert.ok(
    (await store.metrics()).rows.some(
      (row) => row.calls > 0 && row.operation.includes('/api/accounts'),
    ),
  );
  console.log('Nest module, controller, legacy routes and authentication verified.');
} finally {
  if (app) await app.close();
  await isolated.cleanup();
  rmSync(dir, { recursive: true, force: true });
}
