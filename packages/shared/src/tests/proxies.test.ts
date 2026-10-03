import { it, expect } from 'vitest';
import { fixture, session } from '../../../../scripts/checks/helpers.ts';
it('deduplicates credentials, strips session copies and shares proxy checks without exposing passwords', async () => {
  const f = await fixture();
  try {
    const second = await f.store.importAccount(
      { platform: 'x', profileId: 'second', workspaceId: 'w', identity: 'x' },
      session(),
    );
    const first = await f.store.sql.client.platformAccount.findUniqueOrThrow({
      where: { id: f.account.id },
    });
    expect(second).toHaveProperty('proxyId', first.proxyId);
    expect(await f.store.sql.client.proxy.count()).toBe(1);
    const stored = await f.store.sql.client.platformAccount.findUniqueOrThrow({
      where: { id: first.id },
    });
    const raw: any = stored.payload;
    expect(raw.route.account).toBeUndefined();
    expect(raw.configured.proxyInfo).toBeUndefined();
    expect((await f.store.getSecret(first.id)).route?.account.password).toBe(
      'secret-proxy-fixture',
    );
    const proxy = await f.store.sql.client.proxy.findUniqueOrThrow({
      where: { id: first.proxyId! },
    });
    expect(proxy.host).toBe('proxy.example');
    expect(proxy.password).toBe('secret-proxy-fixture');
    expect(JSON.stringify(await f.store.proxies.list())).not.toContain('secret-proxy-fixture');
    await f.store.setProxyCheck(first.id, {
      provider: 'ipify',
      data: { ip: '203.0.113.1', country: 'example' },
      available: true,
    });
    expect(await f.store.getProxyCheck(second.id)).toMatchObject({ data: { country: 'example' } });
    const changed = session();
    changed.route!.account.password = 'different-password';
    await f.store.importAccount(
      { platform: 'x', profileId: 'second', workspaceId: 'w', identity: 'x' },
      changed,
    );
    expect(await f.store.sql.client.proxy.count()).toBe(2);
    expect((await f.store.getSecret(first.id)).route?.account.password).toBe(
      'secret-proxy-fixture',
    );
    await expect(
      f.store.sql.client.proxy.delete({ where: { id: first.proxyId! } }),
    ).rejects.toThrow();
  } finally {
    await f.cleanup();
  }
});
