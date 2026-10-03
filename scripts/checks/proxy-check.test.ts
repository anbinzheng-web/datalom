const openRoute = async () => ({ url: 'http://127.0.0.1:1234', stop: async () => {} });
import { expect, it, vi } from 'vitest';
const fetch = vi.fn();
const createClient = () => ({ fetch }) as any;
import { accountProxy, checkProxy } from '../../packages/network-node/src/proxy-check.ts';
import { session } from './helpers.ts';
it('checks extracted proxy without a two-hop route and rejects invalid IP responses', async () => {
  const secret = session();
  delete secret.route;
  secret.configured.proxyInfo = {
    protocol: 'socks5',
    host: 'proxy.example',
    port: 1080,
    proxyUserName: 'user',
    proxyPassword: 'secret',
  };
  expect(accountProxy(secret)?.username).toBe('user');
  fetch.mockResolvedValue({ status: 200, json: async () => ({ ip: '203.0.113.4' }) });
  expect(await checkProxy(secret, createClient, openRoute)).toMatchObject({
    available: true,
    ip: '203.0.113.4',
  });
  fetch.mockResolvedValue({ status: 200, json: async () => ({ ip: 'invalid' }) });
  await expect(checkProxy(secret, createClient, openRoute)).rejects.toThrow('代理检测失败');
});

it('retains provider JSON, HTTP failures and safe route errors', async () => {
  fetch.mockResolvedValue({
    status: 200,
    json: async () => ({ ip: '203.0.113.4', country: 'example', extra: { score: 42 } }),
  });
  expect(await checkProxy(session(), createClient, openRoute)).toMatchObject({
    provider: 'ipify',
    httpStatus: 200,
    data: { extra: { score: 42 } },
  });
  fetch.mockResolvedValue({ status: 429, json: async () => ({ message: 'quota exceeded' }) });
  await expect(checkProxy(session(), createClient, openRoute)).rejects.toMatchObject({
    result: {
      provider: 'ipify',
      httpStatus: 429,
      error: 'HTTP_ERROR',
      data: { message: 'quota exceeded' },
    },
  });
  await expect(
    checkProxy(session(), createClient, async () => {
      throw Error('secret-proxy-fixture');
    }),
  ).rejects.toMatchObject({ result: { httpStatus: null, error: 'ROUTE_FAILED' } });
});
