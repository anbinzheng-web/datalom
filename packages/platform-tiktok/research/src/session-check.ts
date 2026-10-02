import type { Page } from 'playwright';
import {
  identifyInstagramAccount,
  type AccountIdentityResult,
} from '@datalom/platform-runtime/account-identity';
import { identifyXAccount } from '@datalom/platform-x/api/x-account';
import type { PoolCredential } from '@datalom/platform-runtime/contracts/cookie-pool';

export async function checkSession(page: Page, platform: string) {
  const checkedAt = Date.now();
  const endpoints: Record<string, string> = {
    tiktok: 'https://www.tiktok.com/passport/web/account/info/',
    instagram: 'https://www.instagram.com/api/v1/accounts/current_user/',
    x: 'https://x.com/i/api/1.1/account/verify_credentials.json',
  };
  const target = endpoints[platform];
  if (!target)
    return { status: 'unknown' as const, checkedAt, reason: 'unsupported', identity: '' };
  const result = await page.evaluate(
    async ({ target, platform }) => {
      try {
        const headers: Record<string, string> = { accept: 'application/json, text/plain, */*' };
        if (platform === 'x') {
          const csrf =
            typeof document !== 'undefined'
              ? document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1]
              : undefined;
          if (csrf) {
            try {
              headers['x-csrf-token'] = decodeURIComponent(csrf);
            } catch {
              headers['x-csrf-token'] = csrf;
            }
          }
          headers['x-twitter-active-user'] = 'yes';
          headers['x-twitter-auth-type'] = 'OAuth2Session';
          headers['x-twitter-client-language'] = navigator.language || 'en';
          headers['content-type'] = 'application/json';
          // X requires the public web-client Bearer token in addition to cookies.
          // Read it from the currently loaded client bundle; no credential is persisted.
          try {
            const resources = performance
              .getEntriesByType('resource')
              .map((entry) => (entry as PerformanceResourceTiming).name)
              .filter((url) => /abs\.twimg\.com\/responsive-web\/client-web\/.*\.js/.test(url));
            for (const url of resources.slice(-5).reverse()) {
              const source = await fetch(url, { cache: 'no-store' }).then((r) => r.text());
              const match = source.match(/Bearer\s+([A-Za-z0-9%_-]{20,})/);
              if (match) {
                headers.authorization = `Bearer ${match[1]}`;
                break;
              }
            }
          } catch {
            // The request below will report the HTTP result without this optional header.
          }
        } else if (platform === 'instagram') {
          // Instagram rejects current_user without the app and XMLHttpRequest headers.
          headers['x-ig-app-id'] = '936619743392459';
          headers['x-requested-with'] = 'XMLHttpRequest';
          const csrf =
            typeof document !== 'undefined'
              ? document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1]
              : undefined;
          if (csrf) headers['x-csrftoken'] = decodeURIComponent(csrf);
        }
        const response = await fetch(target, {
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (response.status === 401)
          return {
            status: 'login_required' as const,
            reason: 'unauthorized',
            httpStatus: response.status,
            identity: '',
          };
        const isJson = response.headers.get('content-type')?.includes('json');
        // Some platform edge responses omit content-type on 4xx. Parse the
        // body opportunistically so explicit login/suspension errors survive.
        const bodyText = await response.text();
        let body: any = undefined;
        try {
          body = JSON.parse(bodyText);
        } catch {
          // handled below as a non-JSON response
        }
        if (platform === 'x' && body) {
          const codes = Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.code) : [];
          if (body?.suspended === true || codes.includes(64))
            return {
              status: 'suspended' as const,
              reason: 'X_ACCOUNT_SUSPENDED',
              httpStatus: response.status,
              identity: '',
            };
          if (!response.ok)
            return {
              status: 'unknown' as const,
              reason: 'http_or_content',
              httpStatus: response.status,
              identity: '',
            };
          if (codes.length || body?.error)
            return {
              status: 'unknown' as const,
              reason: 'api_rejected',
              httpStatus: response.status,
              identity: '',
            };
          const rawUsername = body?.screen_name;
          const username =
            typeof rawUsername === 'string' && /^[\w.]{1,100}$/.test(rawUsername)
              ? rawUsername
              : '';
          const id = body?.id_str ?? body?.id;
          const userId =
            typeof id === 'string' && /^\d{1,100}$/.test(id)
              ? id
              : typeof id === 'number' && Number.isSafeInteger(id) && id > 0
                ? String(id)
                : '';
          return userId || username
            ? {
                status: 'valid' as const,
                reason: 'account_identity',
                httpStatus: response.status,
                identity: username || userId,
              }
            : {
                status: 'unknown' as const,
                reason: 'identity_missing',
                httpStatus: response.status,
                identity: '',
              };
        }
        if (!response.ok || !isJson || !body)
          return {
            status: 'unknown' as const,
            reason: 'http_or_content',
            httpStatus: response.status,
            identity: '',
          };
        let user: any;
        if (platform === 'instagram') {
          if (body?.message === 'login_required')
            return {
              status: 'login_required' as const,
              reason: 'login_required',
              httpStatus: response.status,
              identity: '',
            };
          if (body?.status === 'fail')
            return {
              status: 'unknown' as const,
              reason:
                typeof body?.message === 'string' && body.message.length <= 80
                  ? `api_rejected:${body.message}`
                  : 'api_rejected',
              httpStatus: response.status,
              identity: '',
            };
          user = body?.user ?? body?.data?.user;
        } else {
          const code = body?.status_code ?? body?.statusCode ?? body?.data?.error_code;
          if ((code !== undefined && code !== 0 && code !== '0') || body?.message === 'error')
            return {
              status: 'unknown' as const,
              reason: 'api_rejected',
              httpStatus: response.status,
              identity: '',
            };
          user = body?.data?.user ?? body?.data;
        }
        const rawUsername = user?.username ?? user?.screen_name;
        const username =
          typeof rawUsername === 'string' && /^[\w.]{1,100}$/.test(rawUsername) ? rawUsername : '';
        const id =
          platform === 'instagram'
            ? (user?.pk_id ?? user?.pk ?? user?.id ?? user?.user_id)
            : platform === 'x'
              ? (user?.id_str ?? user?.id)
              : (user?.user_id ?? user?.userId ?? user?.uid);
        const userId =
          typeof id === 'string' && /^\d{1,100}$/.test(id)
            ? id
            : typeof id === 'number' && Number.isSafeInteger(id) && id > 0
              ? String(id)
              : '';
        return userId || username
          ? {
              status: 'valid' as const,
              reason: 'account_identity',
              httpStatus: response.status,
              identity: username || userId,
            }
          : {
              status: 'unknown' as const,
              reason: 'identity_missing',
              httpStatus: response.status,
              identity: '',
            };
      } catch {
        return { status: 'unknown' as const, reason: 'request_failed', identity: '' };
      }
    },
    { target, platform },
  );
  return { ...result, checkedAt };
}

export type CollectedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure?: boolean;
  httpOnly?: boolean;
};

export type CollectedProxy = {
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
};

type SessionCheck = {
  status: 'valid' | 'login_required' | 'suspended' | 'unknown';
  checkedAt: number;
  reason: string;
  httpStatus?: number;
  identity: string;
};

function poolProxy(proxy: CollectedProxy): NonNullable<PoolCredential['proxy']> {
  const host = proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host;
  return {
    url: `${proxy.protocol}://${host}:${proxy.port}`,
    ...(proxy.username ? { username: proxy.username } : {}),
    ...(proxy.password ? { password: proxy.password } : {}),
  };
}

function poolCookies(cookies: CollectedCookie[]): PoolCredential['cookies'] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    expires: cookie.expires,
    secure: cookie.secure ?? true,
    httpOnly: cookie.httpOnly ?? false,
  }));
}

function fromIdentity(result: AccountIdentityResult): SessionCheck {
  const checkedAt = Date.now();
  const check = result.identityCheck;
  const httpStatus = typeof check?.httpStatus === 'number' ? check.httpStatus : undefined;
  const username = result.identity.username ?? '';
  const userId = result.identity.userId ?? '';
  const identity =
    /^[\w.]{1,100}$/.test(username) ? username : /^\d{1,100}$/.test(userId) ? userId : '';
  if (check?.status === 'verified' && identity)
    return { status: 'valid', checkedAt, reason: 'account_identity', httpStatus, identity };
  if (check?.reason === 'LOGIN_REQUIRED')
    return { status: 'login_required', checkedAt, reason: 'login_required', httpStatus, identity: '' };
  if (check?.reason === 'X_ACCOUNT_SUSPENDED')
    return {
      status: 'suspended',
      checkedAt,
      reason: 'X_ACCOUNT_SUSPENDED',
      httpStatus,
      identity: '',
    };
  const reason =
    check?.reason === 'ACCOUNT_HTTP_REJECTED' || check?.reason === 'X_ACCOUNT_STATUS_UNKNOWN'
      ? 'http_or_content'
      : check?.reason === 'ACCOUNT_REQUEST_FAILED' ||
          check?.reason === 'PROXY_REQUEST_FAILED' ||
          check?.reason === 'REQUEST_ABORTED'
        ? 'request_failed'
        : check?.reason === 'ACCOUNT_IDENTITY_MISSING'
          ? 'identity_missing'
          : check?.reason === 'ACCOUNT_API_REJECTED'
            ? 'api_rejected'
            : check?.reason === 'CHECKPOINT_REQUIRED'
              ? 'checkpoint_required'
              : check?.reason === 'PROXY_REQUIRED'
              ? 'proxy_required'
              : check?.reason && /^[A-Z_]+$/.test(check.reason)
                ? check.reason
                : 'request_failed';
  return { status: 'unknown', checkedAt, reason, httpStatus, identity: '' };
}

export async function checkCollectedSession(
  input: {
    platform: string;
    cookies: CollectedCookie[];
    userAgent: string;
    proxy?: CollectedProxy;
  },
  deps: {
    identifyInstagramAccount: typeof identifyInstagramAccount;
    identifyXAccount: typeof identifyXAccount;
  } = {
    identifyInstagramAccount,
    identifyXAccount,
  },
): Promise<SessionCheck> {
  const checkedAt = Date.now();
  if (input.platform === 'facebook') {
    const userId = input.cookies.find((cookie) => cookie.name === 'c_user')?.value ?? '';
    const signedIn =
      input.cookies.some((cookie) => cookie.name === 'xs' && cookie.value) &&
      /^\d{1,100}$/.test(userId);
    return signedIn
      ? { status: 'valid', checkedAt, reason: 'account_identity', identity: userId }
      : { status: 'login_required', checkedAt, reason: 'login_required', identity: '' };
  }
  if (input.platform !== 'instagram' && input.platform !== 'x')
    return { status: 'unknown', checkedAt, reason: 'unsupported', identity: '' };
  if (!input.proxy)
    return { status: 'unknown', checkedAt, reason: 'proxy_required', identity: '' };
  const credential: PoolCredential = {
    cookies: poolCookies(input.cookies),
    userAgent: input.userAgent,
    proxy: poolProxy(input.proxy),
  };
  const result =
    input.platform === 'instagram'
      ? await deps.identifyInstagramAccount(credential)
      : await deps.identifyXAccount(credential);
  return fromIdentity(result);
}
