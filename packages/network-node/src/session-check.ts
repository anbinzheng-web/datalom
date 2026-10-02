import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';
import { openAccountRoute } from './proxy-check.ts';
import type { SessionSecret } from '@datalom/shared/runtime/contracts';

export async function checkStoredSession(
  secret: SessionSecret,
  platform: string,
  createClient = (options: ConstructorParameters<typeof Impit>[0]) => new Impit(options),
  openRoute = openAccountRoute,
) {
  const checkedAt = Date.now();
  const result = (
    status: 'valid' | 'login_required' | 'unknown',
    reason: string,
    identity = '',
  ) => ({
    status,
    reason,
    checkedAt,
    transport: 'proxy-http',
    identity,
  });
  if (platform !== 'tiktok') return result('unknown', '该平台尚未接入会话检测');
  if (!secret.observed.userAgent) return result('unknown', '缺少浏览器 UA，请重新提取');
  let route: Awaited<ReturnType<typeof openAccountRoute>> | undefined;
  try {
    route = await openRoute(secret);
    const target = 'https://www.tiktok.com/passport/web/account/info/';
    const jar = new CookieJar();
    for (const c of secret.cookies) {
      if (c.expires > 0 && c.expires * 1000 <= Date.now()) continue;
      await jar.setCookie(
        `${c.name}=${c.value}; Domain=${c.domain}; Path=${c.path}${c.secure ? '; Secure' : ''}`,
        `https://${c.domain.replace(/^\./, '')}${c.path}`,
      );
    }
    const client = createClient({
      proxyUrl: route.url,
      timeout: 15000,
      followRedirects: false,
    });
    const response = await client.fetch(target, {
      headers: {
        'user-agent': secret.observed.userAgent,
        cookie: await jar.getCookieString(target),
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401) return result('login_required', '账号接口确认未登录');
    if (response.status !== 200) return result('unknown', `账号接口 HTTP ${response.status}`);
    const body = (await response.json()) as any;
    const code = body?.status_code ?? body?.statusCode ?? body?.data?.error_code;
    if ((code !== undefined && code !== 0 && code !== '0') || body?.message === 'error')
      return result('unknown', '账号接口未确认登录状态');
    const user = body?.data?.user ?? body?.data;
    const id = user?.user_id ?? user?.userId ?? user?.uid;
    const validId =
      (typeof id === 'string' && /^\d{1,100}$/.test(id)) ||
      (typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
    return validId || (typeof user?.username === 'string' && /^[\w.]{1,100}$/.test(user.username))
      ? result(
          'valid',
          '账号信息验证成功',
          typeof user?.username === 'string' && /^[\w.]{1,100}$/.test(user.username)
            ? user.username
            : String(id),
        )
      : result('unknown', '响应缺少账号身份');
  } catch {
    return result('unknown', '代理连接失败、请求超时或响应无法解析');
  } finally {
    await route?.stop();
  }
}
