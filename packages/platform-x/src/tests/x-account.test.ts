import { test } from 'vitest';
import assert from 'node:assert/strict';
import { identifyXAccount, xSessionFingerprint } from '../api/x-account.ts';
import { xUrlAllowed } from '../api/x-transport.ts';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';

const credential: PoolCredential = {
  cookies: ['auth_token', 'ct0', 'twid'].map((name) => ({
    name,
    value: name === 'twid' ? 'u%3D123' : 'COOKIE_CANARY',
    domain: '.x.com',
    path: '/',
    expires: -1,
    secure: true,
    httpOnly: false,
  })),
  userAgent: 'Fixture UA',
};
const response =
  (body: unknown, status = 200) =>
  async () => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { status, body: text, bytes: Buffer.byteLength(text) };
  };

test('X account checks explicit suspension even on HTTP 200 and returns only a safe summary', async () => {
  for (const [status, body] of [
    [200, { id_str: '123', screen_name: 'test', suspended: true, email: 'EMAIL_CANARY' }],
    [403, { errors: [{ code: 64, message: 'RAW_ERROR_CANARY' }] }],
  ] as const) {
    const result = await identifyXAccount(credential, response(body, status));
    assert.equal(result.identityCheck?.reason, 'X_ACCOUNT_SUSPENDED');
    assert.equal(result.identityCheck?.status, 'unknown');
    assert.equal(result.identity.verifiedAt, null);
    assert.doesNotMatch(JSON.stringify(result), /CANARY|email|auth_token/);
  }
});
test('X unknown failures never imply suspension or successful status verification', async () => {
  for (const [status, body, reason] of [
    [404, '', 'ACCOUNT_EMPTY_BODY'],
    [404, { errors: [{ code: 34 }] }, 'ACCOUNT_HTTP_REJECTED'],
    [200, { id_str: '123', screen_name: 'test' }, 'X_ACCOUNT_STATUS_UNKNOWN'],
    [200, { id_str: '123', screen_name: 'test', suspended: 'true' }, 'X_ACCOUNT_STATUS_UNKNOWN'],
    [401, { errors: [{ code: 89 }] }, 'LOGIN_REQUIRED'],
    [429, { errors: [{ code: 88 }] }, 'RATE_LIMITED'],
    [200, { id_str: '999', screen_name: 'other', suspended: false }, 'ACCOUNT_CHANGED'],
    [
      200,
      { id_str: '123', screen_name: 'test', suspended: false, needs_phone_verification: true },
      'X_ACCOUNT_VERIFICATION_REQUIRED',
    ],
  ] as const) {
    const result = await identifyXAccount(credential, response(body, status));
    assert.equal(result.identityCheck?.reason, reason);
    assert.equal(result.identityCheck?.status, 'unknown');
  }
  const failed = await identifyXAccount(credential, async () => {
    throw new Error('https://proxy/SECRET');
  });
  assert.doesNotMatch(JSON.stringify(failed), /SECRET|https:/);
});
test('X verified identity matches the session and omits private account response fields', async () => {
  const result = await identifyXAccount(
    credential,
    response({
      id_str: '123',
      screen_name: 'test_x',
      name: 'Test',
      suspended: false,
      needs_phone_verification: false,
      email: 'EMAIL_CANARY',
      status: { text: 'PRIVATE_POST_CANARY' },
    }),
  );
  assert.equal(result.identityCheck?.status, 'verified');
  assert.equal(result.identity.username, 'test_x');
  assert.equal(result.identity.userId, '123');
  assert.ok(result.identity.verifiedAt);
  assert.doesNotMatch(JSON.stringify(result), /CANARY|email/);
  const changed = structuredClone(credential.cookies);
  changed[0].value = 'new';
  assert.notEqual(xSessionFingerprint(credential.cookies), xSessionFingerprint(changed));
  assert.equal(
    xSessionFingerprint(credential.cookies),
    xSessionFingerprint([...credential.cookies].reverse()),
  );
});
test('X account transport permits only the observed read-only verification endpoint', () => {
  const u = new URL('https://x.com/i/api/1.1/account/verify_credentials.json');
  assert.equal(xUrlAllowed(u, 'GET'), true);
  assert.equal(xUrlAllowed(u, 'POST'), false);
  assert.equal(
    xUrlAllowed(new URL('https://x.com/i/api/1.1/account/update_profile.json'), 'GET'),
    false,
  );
  u.search = '?redirect=evil';
  assert.equal(xUrlAllowed(u, 'GET'), false);
});
