import { describe, it, expect } from 'vitest';
import { buildApp, authToken } from '@datalom/server/app';
import { fixture } from './helpers.ts';
describe('local API', () => {
  it('requires auth and rejects remote origins and DNS rebinding hosts', async () => {
    const f = await fixture(),
      app = await buildApp(f.store);
    try {
      expect((await app.inject('/api/accounts')).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${await authToken(f.store)}` };
      expect((await app.inject({ url: '/api/accounts', headers })).statusCode).toBe(200);
      expect(
        (
          await app.inject({
            url: '/api/accounts',
            headers: { ...headers, origin: 'https://evil.example' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: '/api/accounts',
            headers: { ...headers, host: 'evil.example' },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
      await f.cleanup();
    }
  });
  it('supports HttpOnly login, masks secrets and generates OpenAPI', async () => {
    const f = await fixture(),
      app = await buildApp(f.store);
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { email: 'admin@datalom.com', password: '12345678' },
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers['set-cookie']).toContain('HttpOnly');
      const headers = {
        cookie: String(login.headers['set-cookie']).split(';')[0],
      };
      const detail = await app.inject({
        url: `/api/accounts/${f.account.id}`,
        headers,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.body).not.toContain('secret-cookie-fixture');
      expect(detail.body).not.toContain('secret-proxy-fixture');
      const doc = await app.inject({ url: '/api/openapi.json', headers });
      expect(doc.json().paths['/api/accounts']).toBeTruthy();
    } finally {
      await app.close();
      await f.cleanup();
    }
  });
});

it('does not authenticate an empty machine token when the environment is unset', async () => {
  const f = await fixture();
  const old = process.env.DATALOM_MANAGEMENT_TOKEN;
  delete process.env.DATALOM_MANAGEMENT_TOKEN;
  const app = await buildApp(f.store);
  try {
    expect((await app.inject('/api/accounts')).statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth',
      payload: { email: 'admin@datalom.com', password: '12345678' },
    });
    expect(login.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: '/api/accounts',
          headers: { cookie: String(login.headers['set-cookie']).split(';')[0] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/tiktok/video',
          headers: { cookie: String(login.headers['set-cookie']).split(';')[0] },
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    if (old === undefined) delete process.env.DATALOM_MANAGEMENT_TOKEN;
    else process.env.DATALOM_MANAGEMENT_TOKEN = old;
    await app.close();
    await f.cleanup();
  }
});
