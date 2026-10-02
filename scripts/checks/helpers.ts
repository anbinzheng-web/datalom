import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "@datalom/shared/storage/store";
import { Vault } from "@datalom/shared/storage/crypto";
import type { SessionSecret } from "@datalom/shared/runtime/contracts";
export const session = (): SessionSecret => ({
  cookies: [
    {
      name: "sid",
      value: "secret-cookie-fixture",
      domain: ".tiktok.com",
      path: "/",
      expires: Date.now() / 1000 + 3600,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ],
  storage: { origins: [], session: {} },
  configured: {},
  observed: {
    userAgent: "test-agent",
    browserVersion: "test",
    language: "en",
    languages: ["en"],
    timezone: "UTC",
  },
  route: {
    upstream: { protocol: "http", host: "127.0.0.1", port: 7897 },
    account: {
      protocol: "socks5",
      host: "proxy.example",
      port: 1080,
      username: "fixture",
      password: "secret-proxy-fixture",
    },
  },
});
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "datalom-test-")),
    key = randomBytes(32),
    store = new Store(dir, new Vault(key));
  return {
    dir,
    key,
    store,
    account: store.importAccount(
      {
        profileId: "profile-fixture",
        workspaceId: "workspace-fixture",
        label: "Test Account",
        identity: "test",
      },
      session(),
    ),
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
