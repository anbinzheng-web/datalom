import { expect, it } from 'vitest';
import { collectProfiles } from '../../packages/platform-tiktok/research/src/collector.ts';
import {
  matchesPlatform,
  platformDomains,
  platformOrigin,
  RoxyConnector,
} from '../../packages/platform-tiktok/research/src/roxy.ts';
import { fixture, session } from './helpers.ts';

it('bounds concurrency, isolates platforms and updates existing encrypted accounts', async () => {
  const f = await fixture();
  const closed: string[] = [];
  let active = 0,
    peak = 0;
  const connector = {
    close: async (id: string) => {
      closed.push(id);
    },
    open: async () => {},
    extract: async (_id: string, platform: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (platform === 'x') throw new Error('private SDK details');
      const secret = session();
      secret.observed.sessionCheck = {
        status: 'unknown',
        reason: 'checkpoint_required',
        httpStatus: 400,
      };
      return { secret, label: 'Fixture', identity: '', warnings: [] };
    },
  } as unknown as RoxyConnector;
  const config = {
    host: 'http://localhost:50000',
    apikey: 'fixture-key',
    workspaceId: 'fixture',
    maxConcurrent: 2,
    profiles: Array.from({ length: 3 }, (_, i) => ({
      dirId: `p${i}`,
      platforms: ['tiktok', 'facebook', 'x'],
    })),
  };
  const reports: unknown[] = [];
  try {
    expect((await collectProfiles(config, f.store, (r) => reports.push(r), connector)).failed).toBe(
      3,
    );
    expect(peak).toBe(2);
    expect(closed.sort()).toEqual(['p0', 'p1', 'p2']);
    await collectProfiles(config, f.store, () => {}, connector);
    const accounts = (await f.store.listAccounts()).filter((a) => a.workspaceId === 'fixture');
    expect(accounts).toHaveLength(6);
    expect(accounts.every((a) => a.version === 2)).toBe(true);
    expect(JSON.stringify(reports)).not.toMatch(/secret-cookie|fixture-key|private SDK/);
    const evidence = (await f.store.listEvidence()) as { summary: string; kind: string }[];
    expect(
      evidence.some(
        (item) =>
          item.kind === 'session-check' &&
          item.summary === '浏览器会话：unknown，原因 checkpoint_required，HTTP 400',
      ),
    ).toBe(true);
    const facebook = accounts.find((a) => a.platform === 'facebook')!;
    expect((await f.store.getSecret(facebook.id)).cookies[0].value).toBe('secret-cookie-fixture');
    expect(matchesPlatform('evilfacebook.com', 'facebook')).toBe(false);
    expect(matchesPlatform('www.facebook.com', 'facebook')).toBe(true);
    for (const platform of ['youtube', 'facebook', 'x', 'instagram'])
      expect(platformDomains[platform]).toBeDefined();
    expect(matchesPlatform('m.youtube.com', 'youtube')).toBe(true);
    expect(matchesPlatform('youtu.be', 'youtube')).toBe(true);
    expect(matchesPlatform('mobile.twitter.com', 'x')).toBe(true);
    expect(platformOrigin('https://www.instagram.com/accounts/', 'instagram')).toBe(true);
    expect(platformOrigin('https://evilinstagram.com/', 'instagram')).toBe(false);
  } finally {
    await f.cleanup();
  }
});
