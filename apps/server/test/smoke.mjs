import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Store } from '@datalom/storage-node/store';
import { Vault } from '@datalom/storage-node/crypto';
import { AppModule } from '../dist/app.module.js';
import { authToken } from '../dist/app.js';

const dir = mkdtempSync(join(tmpdir(), 'datalom-nest-'));
const store = new Store(dir, new Vault(randomBytes(32)));
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
        headers: { authorization: `Bearer ${authToken(store)}` },
      })
    ).statusCode,
    200,
  );
  console.log('Nest module, controller, legacy routes and authentication verified.');
} finally {
  if (app) await app.close();
  else store.close();
  rmSync(dir, { recursive: true, force: true });
}
