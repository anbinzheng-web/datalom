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

export interface ProxyCheckResult {
  provider: 'ipify';
  checkedAt: number;
  durationMs: number;
  available: boolean;
  httpStatus: number | null;
  data: unknown;
  error: string | null;
  ip?: string;
}
export class ProxyCheckError extends DatalomError {
  constructor(readonly result: ProxyCheckResult) {
    super('PROXY_UNAVAILABLE', '代理检测失败：连接、认证或检测渠道异常');
  }
}
export async function checkProxy(
  secret: SessionSecret,
  createClient = (options: ConstructorParameters<typeof Impit>[0]) => new Impit(options),
  openRoute = openAccountRoute,
): Promise<ProxyCheckResult> {
  const started = Date.now();
  const result: ProxyCheckResult = {
    provider: 'ipify',
    checkedAt: started,
    durationMs: 0,
    available: false,
    httpStatus: null,
    data: null,
    error: null,
  };
  let route: Awaited<ReturnType<typeof openRoute>> | undefined;
  let stage = 'ROUTE_FAILED';
  try {
    route = await openRoute(secret);
    stage = 'NETWORK_ERROR';
    const client = createClient({ proxyUrl: route.url, timeout: 15000, followRedirects: false });
    const response = await client.fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(15000),
    });
    result.httpStatus = response.status;
    stage = 'INVALID_RESPONSE';
    const raw = await response.json();
    // Preserve provider fields, excluding authentication material or echoed proxy passwords.
    const password = accountProxy(secret)?.password;
    const redact = (value: any): any => {
      if (typeof value === 'string')
        return password ? value.replaceAll(password, '[REDACTED]') : value;
      if (Array.isArray(value)) return value.map(redact);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key]) =>
                !/^(password|authorization|proxy-authorization|cookie|set-cookie|token)$/i.test(
                  key,
                ),
            )
            .map(([key, child]) => [key, redact(child)]),
        );
      return value;
    };
    result.data = redact(raw);
    if (response.status !== 200) {
      stage = 'HTTP_ERROR';
      throw new Error();
    }
    if (!raw || typeof raw.ip !== 'string' || !isIP(raw.ip)) throw new Error();
    result.ip = raw.ip;
    result.available = true;
  } catch {
    result.error = stage;
  } finally {
    if (route)
      try {
        await route.stop();
      } catch {
        result.available = false;
        result.error = 'ROUTE_CLEANUP_FAILED';
      }
    result.checkedAt = Date.now();
    result.durationMs = Date.now() - started;
  }
  if (!result.available) throw new ProxyCheckError(result);
  return result;
}
