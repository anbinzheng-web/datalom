import { expect, it, vi } from 'vitest';
import { identifyInstagramAccount } from '../../packages/platform-runtime/src/account-identity.ts';
import type { PoolCredential } from '../../packages/platform-runtime/src/contracts/cookie-pool.ts';

const credential: PoolCredential = {
  cookies: ['sessionid', 'ds_user_id', 'csrftoken'].map((name) => ({
    name,
    value: name === 'ds_user_id' ? '456' : 'cookie',
    domain: '.instagram.com',
    path: '/',
    expires: -1,
    secure: true,
    httpOnly: name !== 'csrftoken',
  })),
  userAgent: 'ua',
  proxy: { url: 'http://127.0.0.1:9' },
};

it('reads the Instagram username from the edit form when current_user redirects home', async () => {
  const request = vi.fn(async (_input: unknown, target: string) => {
    if (target.endsWith('/api/v1/accounts/current_user/')) return { status: 302, text: '' };
    expect(target).toBe('https://www.instagram.com/api/v1/accounts/edit/web_form_data/');
    return {
      status: 200,
      text: JSON.stringify({
        status: 'ok',
        form_data: { username: 'insta_user', email: 'secret@example.com', phone_number: '+1' },
      }),
    };
  });
  const result = await identifyInstagramAccount(credential, request as never);
  expect(result.identityCheck).toMatchObject({
    status: 'verified',
    httpStatus: 200,
    endpoint: '/api/v1/accounts/edit/web_form_data/',
  });
  expect(result.identity).toMatchObject({ userId: '456', username: 'insta_user' });
  expect(JSON.stringify(result)).not.toMatch(/secret@example.com|\+1/);
});

it('reports an Instagram checkpoint instead of a generic HTTP failure', async () => {
  const request = vi.fn(async (_input: unknown, target: string) => {
    if (target.endsWith('/api/v1/accounts/current_user/')) return { status: 302, text: '' };
    return {
      status: 400,
      text: JSON.stringify({
        message: 'checkpoint_required',
        status: 'fail',
        checkpoint_url: 'https://www.instagram.com/challenge/SECRET',
      }),
    };
  });
  const result = await identifyInstagramAccount(credential, request as never);
  expect(result.identityCheck).toMatchObject({
    status: 'unknown',
    httpStatus: 400,
    reason: 'CHECKPOINT_REQUIRED',
  });
  expect(result.identity.verifiedAt).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/SECRET/);
});
