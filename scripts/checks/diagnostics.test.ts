import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { HttpTransport } from '@datalom/network-node/transport';
import { CookieJar } from 'tough-cookie';
const input = (id: string) => ({
  accountId: id,
  operation: 'video.detail' as const,
  video: '7685551053554617613',
});
it('records native impit connection failures through an unreachable local proxy without direct fallback', async () => {
  const f = await fixture();
  try {
    const transport = new HttpTransport(
      'http://127.0.0.1:1',
      new CookieJar(),
      {},
      undefined,
      async (stage, outcome, payload) => {
        await f.store.diagnostics.event({}, stage, outcome, payload);
      },
    );
    await expect(
      transport.request('https://www.tiktok.com/', {
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({ code: 'NETWORK', cause: expect.any(Error) });
    const event = ((await f.store.diagnostics.events()) as any[]).find(
      (e) => e.stage === 'http' && e.outcome === 'failed',
    );
    const raw = (await f.store.diagnostics.rawEvent(event.id)) as any;
    expect(raw.error.message).toBeTruthy();
    expect(raw.error.stack).toBeTruthy();
    expect(raw.durationMs).toBeGreaterThanOrEqual(0);
  } finally {
    await f.cleanup();
  }
});
it('persists encrypted local evidence and incident revisions without database tables', async () => {
  const f = await fixture();
  try {
    const id = await f.store.diagnostics.event({ requestId: 'run' }, 'http', 'failed', {
      cookie: 'secret-cookie-fixture',
    });
    expect(await f.store.diagnostics.rawEvent(id)).toEqual({ cookie: 'secret-cookie-fixture' });
    const evidence = await f.store.evidence(f.account.id, 'sample', 'private summary', {
      token: 'secret-token',
    });
    expect(await f.store.diagnostics.rawEvent(evidence)).toEqual({
      summary: 'private summary',
      payload: { token: 'secret-token' },
    });
    await f.store.diagnostics.issue({ id: 'run', accountId: f.account.id }, 'NETWORK');
    await f.store.diagnostics.update(
      { id: 'run' },
      {
        revision: 1,
        state: 'investigating',
        certainty: 'unconfirmed',
        cause: '',
        fix: '',
        nextExperiment: 'Inspect proxy',
      },
    );
    await expect(
      f.store.diagnostics.update(
        { id: 'run' },
        { revision: 1, state: 'open', certainty: '', cause: '', fix: '', nextExperiment: 'Retry' },
      ),
    ).rejects.toThrow();
    expect((await f.store.diagnostics.incident('run')).revision).toBe(2);
    const folder = join(f.dir, 'diagnostics/records');
    const raw = (await import('node:fs/promises')).readdir(folder);
    for (const name of await raw) {
      const text = readFileSync(join(folder, name), 'utf8');
      expect(text).not.toContain('secret-cookie-fixture');
      expect(text).not.toContain('secret-token');
    }
  } finally {
    await f.cleanup();
  }
});
