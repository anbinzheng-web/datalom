import { fileURLToPath } from 'node:url';
import { sourceMode, nodeLoaderArgs } from '@datalom/shared/runtime/paths';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { chmodSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { errorRecord, type Trace } from '@datalom/shared/runtime/diagnostics';
import {
  DatalomError,
  type ProxyEndpoint,
  type RouteConfig,
} from '@datalom/shared/runtime/contracts';
export function validateProxy(p: ProxyEndpoint): void {
  if (
    !p ||
    !['http', 'https', 'socks5'].includes(p.protocol) ||
    !p.host ||
    /[\s/@?#]/.test(p.host) ||
    !Number.isInteger(p.port) ||
    p.port < 1 ||
    p.port > 65535
  )
    throw new DatalomError('INVALID_INPUT', '代理协议、地址或端口无效');
}
export function gostConfig(route: RouteConfig, port: number) {
  validateProxy(route.account);
  const node = (p: ProxyEndpoint, name: string) => ({
    name,
    addr: `${p.host.includes(':') ? '[' + p.host + ']' : p.host}:${p.port}`,
    connector: {
      type: p.protocol === 'socks5' ? 'socks5' : 'http',
      ...(p.username ? { auth: { username: p.username, password: p.password ?? '' } } : {}),
    },
    dialer: { type: p.protocol === 'https' ? 'tls' : 'tcp' },
  });
  return {
    services: [
      {
        name: 'datalom',
        addr: `127.0.0.1:${port}`,
        handler: { type: 'http', chain: 'datalom-chain' },
        listener: { type: 'tcp' },
      },
    ],
    chains: [
      {
        name: 'datalom-chain',
        hops: [
          ...(route.upstream
            ? [{ name: 'upstream', nodes: [node(route.upstream, 'system-proxy')] }]
            : []),
          { name: 'account', nodes: [node(route.account, 'account-proxy')] },
        ],
      },
    ],
    log: { level: 'error', output: 'stderr' },
  };
}
export function parseSystemSettings(text: string): ProxyEndpoint | undefined {
  const field = (name: string) => text.match(new RegExp(`\\b${name}\\s*:\\s*(\\S+)`))?.[1];
  if (field('ProxyAutoConfigEnable') === '1' || field('ProxyAutoDiscoveryEnable') === '1')
    throw new DatalomError('PROXY_UNAVAILABLE', '暂不支持 PAC 自动代理，请使用系统手动代理');
  for (const kind of ['HTTPS', 'HTTP', 'SOCKS']) {
    if (field(`${kind}Enable`) !== '1') continue;
    const endpoint: ProxyEndpoint = {
      protocol: kind === 'SOCKS' ? 'socks5' : 'http',
      host: field(`${kind}Proxy`) ?? '',
      port: Number(field(`${kind}Port`)),
    };
    validateProxy(endpoint);
    return endpoint;
  }
}
export async function systemProxy(accountHost = ''): Promise<ProxyEndpoint | undefined> {
  if (['localhost', '127.0.0.1', '::1'].includes(accountHost)) return undefined;
  const bypass = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    bypass.some(
      (s) =>
        s === '*' ||
        s === accountHost.toLowerCase() ||
        (s.startsWith('.') && accountHost.toLowerCase().endsWith(s)),
    )
  )
    return undefined;
  const raw =
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (raw) {
    try {
      const u = new URL(raw);
      if (
        !['http:', 'https:', 'socks5:'].includes(u.protocol) ||
        u.search ||
        u.hash ||
        (u.pathname && u.pathname !== '/')
      )
        throw new Error();
      const endpoint: ProxyEndpoint = {
        protocol: u.protocol.slice(0, -1) as ProxyEndpoint['protocol'],
        host: u.hostname.replace(/^\[|\]$/g, ''),
        port: Number(u.port || (u.protocol === 'https:' ? 443 : u.protocol === 'http:' ? 80 : 0)),
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
      };
      validateProxy(endpoint);
      return endpoint;
    } catch {
      throw new DatalomError('PROXY_UNAVAILABLE', '系统代理环境变量无效');
    }
  }
  if (process.platform === 'darwin') {
    const text = await new Promise<string>((resolve, reject) =>
      execFile('scutil', ['--proxy'], { timeout: 2000 }, (e, out) =>
        e
          ? reject(new DatalomError('PROXY_UNAVAILABLE', '系统代理检测失败'))
          : resolve(String(out)),
      ),
    );
    return parseSystemSettings(text);
  }
  return undefined;
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address() as { port: number };
      s.close(() => resolve(a.port));
    });
  });
}
export interface RouteHandle {
  url: string;
  stop(): Promise<void>;
}
export async function startRoute(
  route: RouteConfig | undefined,
  dir: string,
  trace?: Trace,
): Promise<RouteHandle> {
  if (!route) throw new DatalomError('PROXY_UNAVAILABLE', '账号没有绑定代理，已阻止请求');
  const resolvedRoute = { ...route, upstream: await systemProxy(route.account.host) };
  const port = await freePort(),
    folder = join(dir, 'runtime');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  chmodSync(folder, 0o700);
  const path = join(folder, `${randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(gostConfig(resolvedRoute, port)), { mode: 0o600 });
  const binary =
    process.env.DATALOM_GOST_BIN ?? process.env.SPIDER_GOST_BIN ?? join(dir, 'bin', 'gost');
  const child: ChildProcess = spawn(
    process.execPath,
    [
      ...nodeLoaderArgs(),
      fileURLToPath(
        new URL(sourceMode ? './route-guardian.ts' : './route-guardian.js', import.meta.url),
      ),
      binary,
      path,
    ],
    {
      stdio: ['pipe', 'ignore', 'pipe'],
    },
  );
  let failed = false;
  let stderr = '',
    stderrBytes = 0,
    exit: unknown,
    spawnError: unknown;
  child.on('error', (error) => {
    spawnError = errorRecord(error);
    failed = true;
  });
  child.on('exit', (code, signal) => {
    exit = { code, signal };
    failed = true;
  });
  let traceFailure: unknown;
  let traceQueue = Promise.resolve();
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBytes += chunk.length;
    stderr = (stderr + chunk.toString('utf8')).slice(-65536);
    traceQueue = traceQueue
      .then(async () => {
        await trace?.('proxy-output', 'received', {
          chunk: chunk.toString('utf8'),
          bytes: chunk.length,
          totalBytes: stderrBytes,
        });
      })
      .catch((error) => {
        traceFailure = error;
        failed = true;
        child.kill('SIGTERM');
      });
  });
  let closed = false;
  const closedPromise = new Promise<void>((resolve) =>
    child.once('close', () => {
      closed = true;
      resolve();
    }),
  );
  let stopPromise: Promise<void> | undefined;
  const stop = async () =>
    (stopPromise ??= (async () => {
      let forced = false;
      if (!closed) {
        child.kill('SIGTERM');
        const timeout = setTimeout(() => {
          forced = true;
          child.kill('SIGKILL');
        }, 2500);
        try {
          await closedPromise;
        } finally {
          clearTimeout(timeout);
        }
      }
      try {
        unlinkSync(path);
      } catch {}
      await traceQueue;
      if (traceFailure) throw traceFailure;
      await trace?.('proxy-process', 'stopped', {
        pid: child.pid,
        exit,
        spawnError,
        stderr,
        stderrBytes,
        truncated: stderrBytes > 65536,
        forced,
      });
    })());
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (failed)
        throw new DatalomError(
          'PROXY_UNAVAILABLE',
          'GOST 未安装或线路启动失败，请运行安装命令并检查配置',
          { cause: { exit, spawnError, stderr, stderrBytes } },
        );
      const ready = await new Promise<boolean>((resolve) => {
        const s = connect({ host: '127.0.0.1', port });
        s.setTimeout(100);
        s.on('connect', () => {
          s.destroy();
          resolve(true);
        });
        s.on('error', () => resolve(false));
        s.on('timeout', () => {
          s.destroy();
          resolve(false);
        });
      });
      if (ready) {
        await trace?.('proxy-process', 'ready', { pid: child.pid, port, binary });
        try {
          unlinkSync(path);
        } catch {}
        return { url: `http://127.0.0.1:${port}`, stop };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new DatalomError('PROXY_UNAVAILABLE', 'GOST 线路启动超时');
  } catch (e) {
    await stop();
    throw e;
  }
}
