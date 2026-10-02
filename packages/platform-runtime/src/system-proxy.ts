import { Client } from 'undici';
import { SocksClient } from 'socks';
import type { Duplex } from 'node:stream';
import net from 'node:net';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';

export class SystemProxyError extends Error {}
export type SystemProxyResolver = (url: string) => Promise<string>;
let resolver: SystemProxyResolver | undefined;
let osLookup: SystemProxyResolver | undefined;
let osCache: { at: number; text: string } | undefined;
// Installed only by the utility-process host adapter; credentials never cross this bridge.
export function setSystemProxyResolver(value: SystemProxyResolver | undefined) {
  resolver = value;
}
export function setOsProxyLookup(value: SystemProxyResolver | undefined) {
  osLookup = value;
  osCache = undefined;
}
export async function outboundSystemProxy(target: string): Promise<URL | undefined> {
  let result: string;
  try {
    result = await detectOsSystemProxy(target);
  } catch {
    throw new SystemProxyError('SYSTEM_PROXY_RESOLVE_FAILED');
  }
  return parseSystemProxy(result);
}
export async function accountUpstream(address: URL): Promise<URL | undefined> {
  const host = address.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  const target = `https://${address.host}/`;
  let result: string;
  try {
    result = resolver ? await resolver(target) : await detectOsSystemProxy(target);
  } catch {
    throw new SystemProxyError('SYSTEM_PROXY_RESOLVE_FAILED');
  }
  return parseSystemProxy(result);
}

function hostExcluded(host: string, patterns: string[]) {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  return patterns.some((pattern) => {
    const needle = pattern.trim().toLowerCase();
    if (!needle) return false;
    if (needle.startsWith('*.')) return value.endsWith(needle.slice(1));
    return value === needle;
  });
}

function envProxyPac(target: string): string | undefined {
  const host = new URL(target).hostname;
  const bypass = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (hostExcluded(host, bypass)) return 'DIRECT';
  const raw =
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;
  if (!raw?.trim()) return;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
  }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname))
    throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
  if (url.protocol === 'socks5:') {
    if (!url.port) throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
    return `SOCKS5 ${url.hostname}:${url.port}`;
  }
  if (url.protocol === 'http:') return `PROXY ${url.hostname}:${url.port || '80'}`;
  if (url.protocol === 'https:') return `HTTPS ${url.hostname}:${url.port || '443'}`;
  throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
}

export function parseDarwinProxy(text: string, target: string): string {
  const host = new URL(target).hostname;
  const exceptions = [
    ...(text.split('ExceptionsList')[1]?.split(/[A-Za-z]+Enable|[A-Za-z]+Proxy/)[0] ?? '').matchAll(
      /:\s*(\S+)/g,
    ),
  ]
    .map((match) => match[1])
    .filter((value) => !['{', '}', '<array>'].includes(value) && !/^\d+$/.test(value));
  if (hostExcluded(host, exceptions)) return 'DIRECT';
  const enabled = (name: string) => new RegExp(`\\b${name}\\s*:\\s*1\\b`).test(text);
  const field = (name: string) => text.match(new RegExp(`\\b${name}\\s*:\\s*(\\S+)`))?.[1];
  if (enabled('HTTPSEnable') && field('HTTPSProxy') && field('HTTPSPort'))
    return `PROXY ${field('HTTPSProxy')}:${field('HTTPSPort')}`;
  if (enabled('HTTPEnable') && field('HTTPProxy') && field('HTTPPort'))
    return `PROXY ${field('HTTPProxy')}:${field('HTTPPort')}`;
  if (enabled('SOCKSEnable') && field('SOCKSProxy') && field('SOCKSPort'))
    return `SOCKS5 ${field('SOCKSProxy')}:${field('SOCKSPort')}`;
  return 'DIRECT';
}

async function detectOsSystemProxy(target: string): Promise<string> {
  if (osLookup) return osLookup(target);
  if (process.platform === 'darwin') {
    const now = Date.now();
    if (!osCache || now - osCache.at > 5000) {
      const text = await new Promise<string>((resolve, reject) => {
        execFile('scutil', ['--proxy'], { timeout: 2000 }, (error, stdout) => {
          if (error) reject(error);
          else resolve(String(stdout ?? ''));
        });
      }).catch(() => '');
      osCache = { at: now, text };
    }
    if (osCache.text.trim()) return parseDarwinProxy(osCache.text, target);
  }
  return envProxyPac(target) ?? 'DIRECT';
}
export function parseSystemProxy(result: string): URL | undefined {
  // Respect the preferred route. Never silently fall back to DIRECT after a proxy failure.
  const first = result.split(';')[0]?.trim();
  if (first === 'DIRECT') return undefined;
  const match = /^(PROXY|HTTPS|SOCKS5) ([^\s]+)$/.exec(first ?? '');
  if (!match) throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
  const protocol = match[1] === 'PROXY' ? 'http' : match[1] === 'HTTPS' ? 'https' : 'socks5';
  try {
    const url = new URL(`${protocol}://${match[2]}`);
    if (url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash)
      throw new Error();
    if (protocol === 'socks5' && !url.port) throw new Error();
    return url;
  } catch {
    throw new SystemProxyError('SYSTEM_PROXY_UNSUPPORTED');
  }
}
export async function systemProxyTunnel(upstream: URL, address: URL, signal: AbortSignal) {
  const port = Number(address.port) || (address.protocol === 'https:' ? 443 : 80);
  let socket: Duplex | undefined;
  let client: Client | undefined;
  const close = async () => {
    signal.removeEventListener('abort', abort);
    socket?.destroy();
    await client?.destroy();
  };
  const abort = () => {
    socket?.destroy();
    void client?.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    if (upstream.protocol === 'socks5:') {
      socket = net.connect({
        host: upstream.hostname.replace(/^\[|\]$/g, ''),
        port: Number(upstream.port),
      });
      await once(socket, 'connect', { signal });
      const connected = await SocksClient.createConnection({
        command: 'connect',
        proxy: {
          host: upstream.hostname.replace(/^\[|\]$/g, ''),
          port: Number(upstream.port),
          type: 5,
        },
        destination: { host: address.hostname.replace(/^\[|\]$/g, ''), port },
        existing_socket: socket,
        timeout: PROXY_REQUEST_TIMEOUT_MS,
      });
      socket = connected.socket;
    } else {
      client = new Client(upstream.origin, { connectTimeout: PROXY_REQUEST_TIMEOUT_MS });
      const connected = await client.connect({ path: `${address.hostname}:${port}`, signal });
      socket = connected.socket;
      if (connected.statusCode !== 200) throw new Error();
    }
    signal.throwIfAborted();
    return { socket, close };
  } catch {
    await close();
    throw new SystemProxyError('SYSTEM_PROXY_CONNECT_FAILED');
  }
}
