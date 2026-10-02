import {
  cookieHeader,
  type PoolCredential,
  type PoolImport,
} from './contracts/cookie-pool.ts';
import { proxyApiGet } from './reverse-transports.ts';
import { LabError } from './reverse-core.ts';
import { PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';

export type AccountIdentityResult = Pick<PoolImport, 'identity' | 'identityCheck'>;
export async function identifyTikTokAccount(
  credential: PoolCredential,
  request = proxyApiGet,
  signal: AbortSignal = AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS),
): Promise<AccountIdentityResult> {
  const target = 'https://www.tiktok.com/passport/web/account/info/';
  const checkedAt = new Date().toISOString();
  const identityCheck: NonNullable<PoolImport['identityCheck']> = {
    status: 'unknown',
    checkedAt,
    endpoint: '/passport/web/account/info/',
    transport: 'proxy-http',
    reason: null,
    httpStatus: null,
    businessStatus: null,
    responseBytes: 0,
  };
  const empty = { userId: null, username: null, displayName: null, verifiedAt: null };
  try {
    if (!credential.proxy) throw new LabError('PROXY_REQUIRED');
    const result = await request(
      {
        cookie: cookieHeader(credential.cookies, target),
        proxy: credential.proxy,
        userAgent: credential.userAgent,
        browserEnvironment: credential.browserEnvironment,
      },
      target,
      signal,
    );
    identityCheck.httpStatus = result.status;
    identityCheck.responseBytes = Buffer.byteLength(result.text);
    if (result.status !== 200)
      throw new LabError(result.status === 429 ? 'RATE_LIMITED' : 'ACCOUNT_HTTP_REJECTED');
    if (!result.text.trim()) throw new LabError('ACCOUNT_EMPTY_BODY');
    let body;
    try {
      body = JSON.parse(result.text);
    } catch {
      throw new LabError('ACCOUNT_NOT_JSON');
    }
    const code = body?.status_code ?? body?.statusCode ?? body?.data?.error_code;
    if (code !== undefined && /^[a-zA-Z0-9_-]{1,30}$/.test(String(code)))
      identityCheck.businessStatus = String(code);
    if ((code !== undefined && ![0, '0'].includes(code)) || body?.message === 'error')
      throw new LabError('ACCOUNT_API_REJECTED');
    const user = body?.data?.user ?? body?.data;
    const rawId = user?.user_id ?? user?.userId ?? user?.uid;
    const userId =
      typeof rawId === 'string' && /^\d{1,100}$/.test(rawId)
        ? rawId
        : typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
          ? String(rawId)
          : null;
    const username =
      typeof user?.username === 'string' && /^[\w.]{1,100}$/.test(user.username)
        ? user.username
        : null;
    const rawName = user?.screen_name ?? user?.display_name ?? user?.nickname;
    const displayName =
      typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 200) : null;
    if (!userId && !username) throw new LabError('ACCOUNT_IDENTITY_MISSING');
    identityCheck.status = 'verified';
    return { identity: { userId, username, displayName, verifiedAt: checkedAt }, identityCheck };
  } catch (error) {
    identityCheck.reason =
      error instanceof LabError && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'ACCOUNT_REQUEST_FAILED';
    return { identity: empty, identityCheck };
  }
}

export async function identifyInstagramAccount(
  credential: PoolCredential,
  request = proxyApiGet,
  signal: AbortSignal = AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS),
): Promise<AccountIdentityResult> {
  const target = 'https://www.instagram.com/api/v1/accounts/current_user/';
  const checkedAt = new Date().toISOString();
  const identityCheck: NonNullable<PoolImport['identityCheck']> = {
    status: 'unknown',
    checkedAt,
    endpoint: '/api/v1/accounts/current_user/',
    transport: 'proxy-http',
    reason: null,
    httpStatus: null,
    businessStatus: null,
    responseBytes: 0,
  };
  const cookieUserId =
    credential.cookies.find((cookie) => cookie.name === 'ds_user_id')?.value ?? null;
  const empty = {
    userId: cookieUserId && /^\d{1,100}$/.test(cookieUserId) ? cookieUserId : null,
    username: null,
    displayName: null,
    verifiedAt: null,
  };
  try {
    if (!credential.proxy) throw new LabError('PROXY_REQUIRED');
    const input = {
      cookie: cookieHeader(credential.cookies, target),
      proxy: credential.proxy,
      userAgent: credential.userAgent,
      browserEnvironment: credential.browserEnvironment,
    };
    let result = await request(input, target, signal);
    // A signed-in web session can redirect current_user to the homepage.
    if (result.status === 302) {
      const formTarget = 'https://www.instagram.com/api/v1/accounts/edit/web_form_data/';
      identityCheck.endpoint = '/api/v1/accounts/edit/web_form_data/';
      result = await request(
        { ...input, cookie: cookieHeader(credential.cookies, formTarget) },
        formTarget,
        signal,
      );
    }
    identityCheck.httpStatus = result.status;
    identityCheck.responseBytes = Buffer.byteLength(result.text);
    let body: any;
    if (result.status !== 200) {
      try {
        body = result.text.trim() ? JSON.parse(result.text) : undefined;
      } catch {
        body = undefined;
      }
      if (body?.message === 'login_required') throw new LabError('LOGIN_REQUIRED');
      if (body?.message === 'checkpoint_required') throw new LabError('CHECKPOINT_REQUIRED');
      throw new LabError(result.status === 429 ? 'RATE_LIMITED' : 'ACCOUNT_HTTP_REJECTED');
    }
    if (!result.text.trim()) throw new LabError('ACCOUNT_EMPTY_BODY');
    try {
      body = JSON.parse(result.text);
    } catch {
      throw new LabError('ACCOUNT_NOT_JSON');
    }
    if (body?.message === 'login_required') throw new LabError('LOGIN_REQUIRED');
    if (body?.status === 'fail') throw new LabError('ACCOUNT_API_REJECTED');
    const user = body?.form_data ?? body?.user ?? body?.data?.user ?? {};
    const rawId = user.pk_id ?? user.pk ?? user.id ?? user.user_id;
    const apiUserId =
      typeof rawId === 'string' && /^\d{1,100}$/.test(rawId)
        ? rawId
        : typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
          ? String(rawId)
          : null;
    const username =
      typeof user.username === 'string' && /^[\w.]{1,30}$/.test(user.username)
        ? user.username
        : null;
    const rawName = user.full_name ?? user.fullName;
    const displayName =
      typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 200) : null;
    if (!apiUserId && !username) throw new LabError('ACCOUNT_IDENTITY_MISSING');
    const userId = apiUserId ?? empty.userId;
    identityCheck.status = 'verified';
    return { identity: { userId, username, displayName, verifiedAt: checkedAt }, identityCheck };
  } catch (error) {
    identityCheck.reason =
      error instanceof LabError && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'ACCOUNT_REQUEST_FAILED';
    return { identity: empty, identityCheck };
  }
}
