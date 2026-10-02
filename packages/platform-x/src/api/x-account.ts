import { createHash } from 'node:crypto';
import {
  cookieHeader,
  type PoolCredential,
  type PoolCookie,
} from '@datalom/platform-runtime/contracts/cookie-pool';
import type { AccountIdentityResult } from '@datalom/platform-runtime/account-identity';
import { openChromeTransport } from '@datalom/platform-runtime/impit-api';
import { accountUpstream } from '@datalom/platform-runtime/system-proxy';
import { XTransport } from './x-transport.ts';
import { LabError, errorCode } from '@datalom/platform-runtime/reverse-core';

export const xAccountEndpoint = '/i/api/1.1/account/verify_credentials.json';
const target = `https://x.com${xAccountEndpoint}`;
const sessionNames = new Set(['auth_token', 'ct0', 'twid']);
export function xSessionFingerprint(cookies: PoolCookie[]) {
  return createHash('sha256')
    .update(
      cookieHeader(cookies, target)
        .split('; ')
        .filter((c) => sessionNames.has(c.split('=', 1)[0]))
        .sort()
        .join('; '),
    )
    .digest('hex');
}
type AccountResponse = { status: number; body: string; bytes: number };
async function requestAccount(
  credential: PoolCredential,
  signal: AbortSignal,
): Promise<AccountResponse> {
  if (!credential.proxy) throw new LabError('PROXY_REQUIRED');
  const upstream = await accountUpstream(new URL(credential.proxy.url));
  signal.throwIfAborted();
  const transport = await openChromeTransport(credential.proxy, signal, upstream, 30_000);
  try {
    // No raw account response, email, cookies or authentication headers are persisted.
    return await new XTransport(transport.client, credential, signal, () => {}).verifyAccount();
  } finally {
    await transport.close();
  }
}

// A 200 response can still describe a suspended account. Only explicit status proves suspension.
export async function identifyXAccount(
  credential: PoolCredential,
  request: (
    credential: PoolCredential,
    signal: AbortSignal,
  ) => Promise<AccountResponse> = requestAccount,
  signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<AccountIdentityResult> {
  const checkedAt = new Date().toISOString();
  const cookie = cookieHeader(credential.cookies, target);
  const cookieUserId = /(?:^|; )twid=u%3D(\d+)(?:;|$)/i.exec(cookie)?.[1] ?? null;
  const identity = { userId: cookieUserId, username: null, displayName: null, verifiedAt: null };
  const check: NonNullable<AccountIdentityResult['identityCheck']> = {
    status: 'unknown',
    checkedAt,
    endpoint: xAccountEndpoint,
    transport: 'proxy-http',
    reason: null,
    httpStatus: null,
    businessStatus: null,
    responseBytes: 0,
  };
  try {
    const r = await request(credential, signal);
    check.httpStatus = r.status;
    check.responseBytes = r.bytes;
    let body: any;
    try {
      body = JSON.parse(r.body);
    } catch {
      throw new LabError(
        r.status === 429
          ? 'RATE_LIMITED'
          : r.body.trim()
            ? 'ACCOUNT_NOT_JSON'
            : 'ACCOUNT_EMPTY_BODY',
      );
    }
    const codes = Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.code) : [];
    const code = codes.find((c: unknown) => Number.isSafeInteger(c));
    if (code !== undefined) check.businessStatus = String(code);
    if (body?.suspended === true || codes.includes(64)) throw new LabError('X_ACCOUNT_SUSPENDED');
    if (r.status === 429 || codes.includes(88)) throw new LabError('RATE_LIMITED');
    if (r.status === 401 || codes.some((c: unknown) => c === 32 || c === 89))
      throw new LabError('LOGIN_REQUIRED');
    if (r.status !== 200) throw new LabError('ACCOUNT_HTTP_REJECTED');
    if (codes.length) throw new LabError('ACCOUNT_API_REJECTED');
    if (body?.suspended !== false) throw new LabError('X_ACCOUNT_STATUS_UNKNOWN');
    if (body.needs_phone_verification === true)
      throw new LabError('X_ACCOUNT_VERIFICATION_REQUIRED');
    if (
      typeof body.id_str !== 'string' ||
      !/^\d{1,100}$/.test(body.id_str) ||
      typeof body.screen_name !== 'string' ||
      !/^[A-Za-z0-9_]{1,50}$/.test(body.screen_name)
    )
      throw new LabError('ACCOUNT_IDENTITY_MISSING');
    if (cookieUserId && body.id_str !== cookieUserId) throw new LabError('ACCOUNT_CHANGED');
    check.status = 'verified';
    return {
      identity: {
        userId: body.id_str,
        username: body.screen_name,
        displayName: typeof body.name === 'string' ? body.name.trim().slice(0, 200) || null : null,
        verifiedAt: checkedAt,
      },
      identityCheck: check,
    };
  } catch (cause) {
    const code = errorCode(cause);
    check.reason = code === 'EXPERIMENT_FAILED' ? 'ACCOUNT_REQUEST_FAILED' : code;
    return { identity, identityCheck: check };
  }
}
