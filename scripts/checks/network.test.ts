import { dataDirectory } from '@datalom/shared/runtime/paths';
import { it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CookieJar } from 'tough-cookie';
import { gostConfig, startRoute } from '@datalom/network-node/route';
import { HttpTransport } from '@datalom/network-node/transport';
import { fixture, session } from './helpers.ts';
import { chainFixture, proxyGet } from './proxy-fixture.ts';
it('rejects direct clients, arbitrary targets and missing routes', async () => {
  expect(() => new HttpTransport('https://www.tiktok.com', new CookieJar())).toThrow();
  const t = new HttpTransport('http://127.0.0.1:1', new CookieJar());
  await expect(
    t.request('http://127.0.0.1', { signal: AbortSignal.timeout(100) }),
  ).rejects.toThrow();
  await expect(
    t.request('https://tiktok.com.evil.example/', {
      signal: AbortSignal.timeout(100),
    }),
  ).rejects.toThrow();
  await expect(startRoute(undefined, '/tmp')).rejects.toThrow(/代理/);
});
it('configures two ordered hops and authenticated downstream', () => {
  const config = gostConfig(session().route!, 30000);
  expect(config.chains[0].hops.map((h) => h.name)).toEqual(['upstream', 'account']);
  expect(config.chains[0].hops[1].nodes[0].connector.auth?.username).toBe('fixture');
});
const binary =
  process.env.DATALOM_GOST_BIN ??
  process.env.SPIDER_GOST_BIN ??
  resolve(dataDirectory(), 'bin/gost');
it.skipIf(!existsSync(binary))(
  'runs real GOST through the loopback account proxy and fails closed when it goes down',
  async () => {
    const old = process.env.DATALOM_GOST_BIN;
    process.env.DATALOM_GOST_BIN = binary;
    const f = await fixture(),
      chain = await chainFixture();
    let route;
    try {
      route = await startRoute(
        {
          upstream: {
            protocol: 'http',
            host: '127.0.0.1',
            port: chain.upstreamPort,
          },
          account: {
            protocol: 'http',
            host: '127.0.0.1',
            port: chain.downstreamPort,
          },
        },
        f.dir,
        async (stage, outcome, payload, code) => {
          await f.store.diagnostics.event({}, stage, outcome, payload, code);
        },
      );
      expect(await proxyGet(route.url, chain.targetPort)).toBe(200);
      expect(chain.events).toEqual([`account:127.0.0.1:${chain.targetPort}`]);
      expect(chain.requests()).toBe(1);
      await chain.breakAccount();
      try {
        expect(await proxyGet(route.url, chain.targetPort)).not.toBe(200);
      } catch {}
      expect(chain.requests()).toBe(1);
      await route.stop();
      const diagnosticEvents = (await f.store.diagnostics.events()) as any[];
      const stopped = diagnosticEvents.find(
        (e) => e.stage === 'proxy-process' && e.outcome === 'stopped',
      );
      expect(stopped).toBeTruthy();
      expect(await f.store.diagnostics.rawEvent(stopped.id)).toHaveProperty('exit');
      expect(diagnosticEvents.some((e) => e.stage === 'proxy-output')).toBe(true);
    } finally {
      await route?.stop();
      await chain.close();
      await f.cleanup();
      if (old) process.env.DATALOM_GOST_BIN = old;
      else delete process.env.DATALOM_GOST_BIN;
    }
  },
  15000,
);
