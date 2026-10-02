import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { checkCollectedSession, checkSession } from '../../packages/platform-tiktok/research/src/session-check.ts';

afterEach(() => vi.unstubAllGlobals());
const page = {
  evaluate: (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
} as unknown as Page;
it('requires account identity and does not call rate limiting a logged-out session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { user_id: '123', username: 'fixture' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect((await checkSession(page, 'tiktok')).status).toBe('valid');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
  expect((await checkSession(page, 'tiktok')).status).toBe('unknown');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
  expect((await checkSession(page, 'tiktok')).status).toBe('login_required');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { nickname: 'Guest' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect((await checkSession(page, 'tiktok')).status).toBe('unknown');
});

it('validates Instagram and X with their account identity endpoints', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { pk: '456', username: 'insta_user' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect(await checkSession(page, 'instagram')).toMatchObject({
    status: 'valid',
    identity: 'insta_user',
  });
  expect(fetch).toHaveBeenLastCalledWith(
    'https://www.instagram.com/api/v1/accounts/current_user/',
    expect.any(Object),
  );

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_str: '789', screen_name: 'x_user' }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect(await checkSession(page, 'x')).toMatchObject({ status: 'valid', identity: 'x_user' });
  expect(fetch).toHaveBeenLastCalledWith(
    'https://x.com/i/api/1.1/account/verify_credentials.json',
    expect.any(Object),
  );
});

const cookie = (name: string, value: string, domain: string) => ({
  name,
  value,
  domain,
  path: '/',
  expires: -1,
  secure: true,
  httpOnly: false,
});

it('reads Facebook identity from c_user and checks Instagram and X through the account proxy', async () => {
  expect(
    await checkCollectedSession({
      platform: 'facebook',
      userAgent: 'ua',
      cookies: [cookie('c_user', '100', '.facebook.com'), cookie('xs', 'session', '.facebook.com')],
    }),
  ).toMatchObject({ status: 'valid', reason: 'account_identity', identity: '100' });
  expect(
    await checkCollectedSession({
      platform: 'facebook',
      userAgent: 'ua',
      cookies: [cookie('c_user', '100', '.facebook.com')],
    }),
  ).toMatchObject({ status: 'login_required', identity: '' });

  const identifyInstagramAccount = vi.fn().mockResolvedValue({
    identity: { userId: '456', username: 'insta_user', displayName: null, verifiedAt: null },
    identityCheck: { status: 'verified', httpStatus: 200, reason: null },
  });
  const identifyXAccount = vi.fn();
  expect(
    await checkCollectedSession(
      {
        platform: 'instagram',
        userAgent: 'ua',
        cookies: [cookie('sessionid', 's', '.instagram.com')],
        proxy: { protocol: 'http', host: '127.0.0.1', port: 9 },
      },
      { identifyInstagramAccount, identifyXAccount },
    ),
  ).toMatchObject({ status: 'valid', identity: 'insta_user', httpStatus: 200 });
  expect(identifyInstagramAccount).toHaveBeenCalledOnce();
  expect(identifyXAccount).not.toHaveBeenCalled();

  identifyXAccount.mockResolvedValue({
    identity: { userId: '789', username: 'x_user', displayName: null, verifiedAt: null },
    identityCheck: { status: 'verified', httpStatus: 200, reason: null },
  });
  expect(
    await checkCollectedSession(
      {
        platform: 'x',
        userAgent: 'ua',
        cookies: [cookie('auth_token', 'a', '.x.com'), cookie('ct0', 'b', '.x.com')],
        proxy: { protocol: 'socks5', host: '127.0.0.1', port: 9 },
      },
      { identifyInstagramAccount, identifyXAccount },
    ),
  ).toMatchObject({ status: 'valid', identity: 'x_user' });

  identifyXAccount.mockResolvedValue({
    identity: { userId: null, username: null, displayName: null, verifiedAt: null },
    identityCheck: { status: 'unknown', httpStatus: 403, reason: 'X_ACCOUNT_SUSPENDED' },
  });
  expect(
    await checkCollectedSession(
      {
        platform: 'x',
        userAgent: 'ua',
        cookies: [cookie('auth_token', 'a', '.x.com')],
        proxy: { protocol: 'http', host: '127.0.0.1', port: 9 },
      },
      { identifyInstagramAccount, identifyXAccount },
    ),
  ).toMatchObject({ status: 'suspended', reason: 'X_ACCOUNT_SUSPENDED', httpStatus: 403 });

  expect(
    (
      await checkCollectedSession(
        { platform: 'instagram', userAgent: 'ua', cookies: [] },
        { identifyInstagramAccount, identifyXAccount },
      )
    ).reason,
  ).toBe('proxy_required');
  expect((await checkCollectedSession({ platform: 'youtube', userAgent: 'ua', cookies: [] })).reason).toBe(
    'unsupported',
  );
});

it('leaves YouTube and an in-page Facebook check unknown until a verified identity endpoint exists', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect((await checkSession(page, 'youtube')).status).toBe('unknown');
  expect((await checkSession(page, 'facebook')).status).toBe('unknown');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('detects explicitly suspended X accounts even when the API responds with an error status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ code: 64, message: 'Account suspended' }] }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect(await checkSession(page, 'x')).toMatchObject({
    status: 'suspended',
    reason: 'X_ACCOUNT_SUSPENDED',
    identity: '',
  });

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suspended: true, id_str: '789', screen_name: 'x_user' }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  expect((await checkSession(page, 'x')).status).toBe('suspended');
});
