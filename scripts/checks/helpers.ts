import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { testStore } from '@datalom/shared/storage/testing';
import { Vault } from '@datalom/shared/storage/crypto';
import type { SessionSecret } from '@datalom/shared/runtime/contracts';
export const session = (): SessionSecret => ({
  cookies: [
    {
      name: 'sid',
      value: 'secret-cookie-fixture',
      domain: '.tiktok.com',
      path: '/',
      expires: Date.now() / 1000 + 3600,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ],
  storage: { origins: [], session: {} },
  configured: {},
  observed: {
    userAgent: 'test-agent',
    browserVersion: 'test',
    language: 'en',
    languages: ['en'],
    timezone: 'UTC',
  },
  route: {
    upstream: { protocol: 'http', host: '127.0.0.1', port: 7897 },
    account: {
      protocol: 'socks5',
      host: 'proxy.example',
      port: 1080,
      username: 'fixture',
      password: 'secret-proxy-fixture',
    },
  },
});
export async function fixture() {
  process.env.DATALOM_MANAGEMENT_TOKEN ??= 'test-management-token-only-32-characters';
  const dir = mkdtempSync(join(tmpdir(), 'datalom-test-')),
    key = randomBytes(32),
    isolated = await testStore(dir, key),
    store = isolated.store;
  return {
    dir,
    key,
    url: isolated.url,
    store,
    account: await store.importAccount(
      {
        profileId: 'profile-fixture',
        workspaceId: 'workspace-fixture',
        label: 'Test Account',
        identity: 'test',
      },
      session(),
    ),
    cleanup: async () => {
      await isolated.cleanup();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
