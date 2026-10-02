import { expect, it } from 'vitest';
import { gostConfig, parseSystemSettings } from '../../packages/network-node/src/route.ts';
it('detects macOS Clash HTTP proxy even when port precedes host', () => {
  expect(parseSystemSettings('HTTPEnable : 1\nHTTPPort : 7897\nHTTPProxy : 127.0.0.1')).toEqual({
    protocol: 'http',
    host: '127.0.0.1',
    port: 7897,
  });
  expect(parseSystemSettings('HTTPEnable : 0')).toBeUndefined();
  expect(() => parseSystemSettings('ProxyAutoConfigEnable : 1')).toThrow();
});
it('keeps account proxy as last hop with and without a system proxy', () => {
  const account = { protocol: 'socks5' as const, host: 'proxy.example', port: 9000 };
  expect(gostConfig({ account }, 1234).chains[0].hops.map((h) => h.name)).toEqual(['account']);
  expect(
    gostConfig(
      { account, upstream: { protocol: 'http', host: '127.0.0.1', port: 7897 } },
      1234,
    ).chains[0].hops.map((h) => h.name),
  ).toEqual(['upstream', 'account']);
});
