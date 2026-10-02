import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { SocksClient } from 'socks';
import type { PoolProxy } from './contracts/cookie-pool.ts';
import { poolProxy } from './contracts/cookie-pool.ts';
import { LabError } from './reverse-core.ts';
import { systemProxyTunnel } from './system-proxy.ts';
import { PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';

export type ProxyBridgeEvent = { stage: string; error?: string; reason?: string };
export type LocalHttpBridge = { url: string; close: () => Promise<void> };

const connectHosts = new Set([
  'www.tiktok.com',
  'www.instagram.com',
  'instagram.com',
  'www.facebook.com',
  'facebook.com',
  'www.youtube.com',
  'youtube.com',
  'x.com',
  'abs.twimg.com',
]);

function impersonatedProxyUrl(proxy: PoolProxy) {
  const url = new URL(proxy.url);
  if (proxy.username !== undefined) url.username = proxy.username;
  if (proxy.password !== undefined) url.password = proxy.password;
  return url.toString();
}

export async function startAccountHttpBridge(
  proxy: PoolProxy,
  signal: AbortSignal,
  upstream?: URL,
  observe?: (entry: ProxyBridgeEvent) => void,
): Promise<LocalHttpBridge> {
  const parsed = poolProxy.safeParse(proxy);
  if (!parsed.success) throw new LabError('INVALID_PROXY');
  const address = new URL(parsed.data.url);
  if (address.protocol === 'http:' || address.protocol === 'https:')
    return { url: impersonatedProxyUrl(parsed.data), close: async () => {} };
  if (address.protocol !== 'socks5:') throw new LabError('INVALID_PROXY');

  const sockets = new Set<net.Socket>();
  const tunnels = new Set<Awaited<ReturnType<typeof systemProxyTunnel>>>();
  const track = (socket: net.Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const abort = () => {
    for (const socket of sockets) socket.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });

  const server = http.createServer((_req, res) => {
    res.writeHead(405).end();
  });
  server.on('connect', (req, client, head) => {
    track(client as net.Socket);
    let stage = 'target-validation';
    void (async () => {
      const target = new URL(`https://${req.url ?? ''}`);
      if (
        !connectHosts.has(target.hostname) ||
        (target.port && target.port !== '443') ||
        target.username ||
        target.password
      ) {
        client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return;
      }
      signal.throwIfAborted();
      stage = upstream ? 'system-proxy-tunnel' : 'account-proxy-connect';
      observe?.({ stage });
      const existing = upstream
        ? await (async () => {
            const tunnel = await systemProxyTunnel(upstream, address, signal);
            tunnels.add(tunnel);
            return tunnel.socket as net.Socket;
          })()
        : track(
            net.connect({
              host: address.hostname.replace(/^\[|\]$/g, ''),
              port: Number(address.port),
            }),
          );
      if (!upstream) await once(existing, 'connect', { signal });
      stage = 'account-proxy-socks';
      observe?.({ stage });
      const connected = await SocksClient.createConnection({
        command: 'connect',
        proxy: {
          host: address.hostname.replace(/^\[|\]$/g, ''),
          port: Number(address.port),
          type: 5,
          userId: parsed.data.username,
          password: parsed.data.password,
        },
        destination: { host: target.hostname, port: 443 },
        existing_socket: existing,
        timeout: PROXY_REQUEST_TIMEOUT_MS,
      });
      const remote = track(connected.socket);
      stage = 'target-tunnel-established';
      observe?.({ stage });
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) remote.write(head);
      remote.pipe(client);
      client.pipe(remote);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '';
      observe?.({
        stage,
        // Never forward SOCKS errors/options: they may contain account credentials.
        reason:
          message === 'Socket closed'
            ? 'SOCKET_CLOSED'
            : message === 'Proxy connection timed out'
              ? 'TIMEOUT'
              : message === 'Socks5 Authentication failed'
                ? 'AUTHENTICATION_REJECTED'
                : 'HANDSHAKE_FAILED',
        error: signal.aborted
          ? 'REQUEST_ABORTED'
          : message === 'Socks5 Authentication failed'
            ? 'PROXY_AUTH_FAILED'
            : stage === 'account-proxy-socks'
              ? 'PROXY_TUNNEL_FAILED'
              : stage === 'system-proxy-tunnel'
                ? 'SYSTEM_PROXY_CONNECT_FAILED'
                : 'PROXY_CONNECT_FAILED',
      });
      if (!client.destroyed) client.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      signal.removeEventListener('abort', abort);
      abort();
      await Promise.all([...tunnels].map((tunnel) => tunnel.close()));
      tunnels.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
