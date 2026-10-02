const openRoute = async () => ({ url: 'http://127.0.0.1:1234', stop: async () => {} });
import { expect, it, vi } from 'vitest';
import { checkStoredSession } from '../../packages/network-node/src/session-check.ts';
import { session } from './helpers.ts';
it('sends saved UA and scoped cookies through the proxy and treats 429 as unknown', async () => {
  const secret = session();
  secret.cookies.push({ ...secret.cookies[0], domain: '.example.com', name: 'unrelated' });
  const fetch = vi
    .fn()
    .mockResolvedValue({ status: 200, json: async () => ({ data: { user_id: '123' } }) });
  const create = vi.fn((_options: unknown) => ({ fetch }) as any);
  expect((await checkStoredSession(secret, 'tiktok', create, openRoute)).status).toBe('valid');
  expect(create.mock.calls[0][0]).toMatchObject({ followRedirects: false });
  const headers = fetch.mock.calls[0][1].headers;
  expect(headers['user-agent']).toBe(secret.observed.userAgent);
  expect(headers.cookie).toContain('sid=secret-cookie-fixture');
  expect(headers.cookie).not.toContain('unrelated');
  fetch.mockResolvedValue({ status: 429 });
  expect((await checkStoredSession(secret, 'tiktok', create, openRoute)).status).toBe('unknown');
  fetch.mockResolvedValue({ status: 401 });
  expect((await checkStoredSession(secret, 'tiktok', create, openRoute)).status).toBe('login_required');
});
