import assert from 'node:assert/strict';
import { test, vi, afterEach } from 'vitest';
afterEach(() => vi.unstubAllEnvs());
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountProxyFixture } from '@datalom/platform-runtime/fixtures/account-proxy';
import { collectServerYouTubeKeyword } from '../api/server-youtube-keyword.ts';

// Network-level regression for the observed SOCKS socket-close failure. No real site requests.
test('YouTube reconnects the same proxy after SOCKS EOF, preserves errors, and bounds recovery', async () => {
  vi.stubEnv('NODE_TEST_CONTEXT', 'fixture');
  const root = mkdtempSync(join(tmpdir(), 'youtube-proxy-'));
  const cert = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      join(root, 'key.pem'),
      '-out',
      join(root, 'cert.pem'),
      '-subj',
      '/CN=www.youtube.com',
    ],
    { stdio: 'ignore' },
  );
  assert.equal(cert.status, 0);
  const fixture = await accountProxyFixture(root);
  const search = JSON.parse(
    readFileSync(new URL('./fixtures/youtube-search.json', import.meta.url), 'utf8'),
  );
  const html = (data: unknown) =>
    `ytcfg.set(${JSON.stringify({ LOGGED_IN: true, INNERTUBE_CONTEXT: { client: { clientVersion: 'fixture' } } })});var ytInitialData = ${JSON.stringify(data)};`;
  fixture.state.respond = (url) => ({
    status: 200,
    body: html(url.pathname === '/results' ? search : {}),
  });
  const evidence: Record<string, unknown>[] = [];
  const credential = {
    userAgent: 'fixture',
    cookies: [
      {
        name: 'sessionid',
        value: 'SMOKE_COOKIE_CANARY',
        domain: '.youtube.com',
        path: '/',
        secure: true,
        httpOnly: true,
        expires: -1,
      },
    ],
    proxy: {
      url: `socks5://127.0.0.1:${fixture.socksPort}`,
      username: 'fixture',
      password: 'PROXY_CANARY',
    },
  };
  const run = () =>
    collectServerYouTubeKeyword({
      input: {
        keyword: 'fixture',
        videoLimit: 1,
        minLikes: null,
        commentsPerVideo: 0,
        totalComments: 0,
        maxMinutes: 1,
      },
      credential,
      signal: AbortSignal.timeout(30000),
      maxPages: 10,
      evidence: (e) => evidence.push(e),
      progress: () => {},
    });
  try {
    fixture.state.socksDisconnects = 2;
    const recovered = await run();
    assert.equal(recovered.complete, true);
    assert.equal(recovered.datasets['youtube.videos']?.length, 1);
    assert.equal(recovered.recoveries, 2);
    assert.equal(recovered.requestAttempts, 4);
    assert.equal(
      evidence.filter((e) => e.kind === 'http-exchange' && e.error === 'PROXY_TUNNEL_FAILED')
        .length,
      2,
    );
    assert.ok(evidence.some((e) => e.kind === 'proxy-connection' && e.error));
    assert.doesNotMatch(JSON.stringify(evidence), /PROXY_CANARY|SMOKE_COOKIE_CANARY/);
    evidence.length = 0;
    fixture.state.socksDisconnects = 5;
    const exhausted = await run();
    assert.equal(exhausted.complete, false);
    assert.equal(exhausted.error, 'PROXY_TUNNEL_FAILED');
    assert.equal(exhausted.requestAttempts, 3);
    assert.equal(exhausted.recoveries, 2);
    assert.equal(fixture.state.socksDisconnects, 2);
    fixture.state.socksDisconnects = 0;
    credential.proxy.password = 'WRONG_PASSWORD';
    // Do not send this to the fixture's strict authenticator: auth failures are tested below
    // using the fixture's explicit rejection mode.
    credential.proxy.password = 'PROXY_CANARY';
    fixture.state.socksReject = true;
    evidence.length = 0;
    const rejected = await run();
    assert.equal(rejected.complete, false);
    assert.equal(rejected.error, 'PROXY_AUTH_FAILED');
    assert.equal(rejected.requestAttempts, 1);
    assert.equal(rejected.recoveries, 0);
  } finally {
    await fixture.close();
    rmSync(root, { recursive: true, force: true });
  }
});
