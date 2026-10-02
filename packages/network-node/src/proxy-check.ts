import { Impit } from 'impit';
import { startRoute } from './route.ts';
import { dataDirectory } from '@datalom/shared/runtime/paths';
import type { ProxyEndpoint } from '@datalom/shared/runtime/contracts';
import { isIP } from 'node:net';
import { DatalomError, type SessionSecret } from '@datalom/shared/runtime/contracts';

export function accountProxy(secret: SessionSecret) {
  const raw = secret.route?.account ?? (secret.configured.proxyInfo as any);
  if (!raw) return null;
  const protocol = String(raw.protocol ?? raw.proxyCategory ?? '').toLowerCase();
  const port = Number(raw.port);
  if (
    !['http', 'https', 'socks5'].includes(protocol) ||
    typeof raw.host !== 'string' ||
    !raw.host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    return null;
  return {
    protocol,
    host: raw.host,
    port,
    username: raw.username ?? raw.proxyUserName,
    password: raw.password ?? raw.proxyPassword,
  };
}

export function proxyUrl(secret: SessionSecret) {
  const proxy = accountProxy(secret);
  if (!proxy) throw new DatalomError('PROXY_UNAVAILABLE', '账号没有可用的代理配置，请重新提取');
  const url = new URL(
    `${proxy.protocol}://${proxy.host.includes(':') ? `[${proxy.host}]` : proxy.host}:${proxy.port}`,
  );
  if (
    url.hostname.replace(/^\[|\]$/g, '') !== proxy.host ||
    (url.port !== String(proxy.port) && ![80, 443].includes(proxy.port))
  )
    throw new DatalomError('INVALID_INPUT', '代理地址格式无效');
  if (proxy.username) url.username = proxy.username;
  if (proxy.password) url.password = proxy.password;
  return url.href;
}

export async function openAccountRoute(secret: SessionSecret) {
  const account = accountProxy(secret);
  if (!account) throw new DatalomError('PROXY_UNAVAILABLE', '账号没有可用代理');
  return startRoute({ account: account as ProxyEndpoint }, dataDirectory());
}

export async function checkProxy(
  secret: SessionSecret,
  createClient = (options: ConstructorParameters<typeof Impit>[0]) => new Impit(options),
  openRoute = openAccountRoute,
) {
  const route = await openRoute(secret);
  const url = route.url;
  const started = Date.now();
  try {
    const client = createClient({ proxyUrl: url, timeout: 15000, followRedirects: false });
    const response = await client.fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 200) throw new Error();
    const body = (await response.json()) as { ip?: string };
    if (!body.ip || !isIP(body.ip)) throw new Error();
    return {
      available: true,
      ip: body.ip,
      checkedAt: Date.now(),
      durationMs: Date.now() - started,
    };
  } catch {
    throw new DatalomError('PROXY_UNAVAILABLE', '代理检测失败：连接超时、认证失败或出口服务不可达');
  } finally {
    await route.stop();
  }
}
