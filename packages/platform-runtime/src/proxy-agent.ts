import { Agent, Client, ProxyAgent } from 'undici';
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import { SocksClient } from 'socks';
import type { PoolProxy } from './contracts/cookie-pool.ts';
import { systemProxyTunnel, SystemProxyError } from './system-proxy.ts';
import { PROXY_REQUEST_TIMEOUT_MS } from './proxy-timeout.ts';

export class ProxyConnectionError extends Error {}

export function accountProxyAgent(
  proxy: PoolProxy,
  signal: AbortSignal,
  upstream?: URL,
  observe?: (stage: 'proxy-connect' | 'proxy-tunnel' | 'target-tls' | 'connected') => void,
) {
  const address = new URL(proxy.url);
  const tunnels = new Set<Awaited<ReturnType<typeof systemProxyTunnel>>>();
  const connectUpstream = async () => {
    const tunnel = await systemProxyTunnel(upstream!, address, signal);
    tunnels.add(tunnel);
    return tunnel.socket;
  };
  const closeTunnels = async () => {
    await Promise.all([...tunnels].map((tunnel) => tunnel.close()));
    tunnels.clear();
  };
  if (address.protocol !== 'socks5:') {
    const dispatcher = new ProxyAgent({
      uri: proxy.url,
      ...(upstream
        ? {
            clientFactory: (origin: URL) =>
              new Client(origin, {
                connect: (_options, callback) => {
                  void (async () => {
                    const socket = await connectUpstream();
                    if (address.protocol !== 'https:') return socket as net.Socket;
                    const secure = tls.connect({
                      socket,
                      servername: address.hostname,
                      rejectUnauthorized: true,
                      ALPNProtocols: ['http/1.1'],
                    });
                    await once(secure, 'secureConnect', { signal });
                    return secure;
                  })().then(
                    (socket) => callback(null, socket),
                    () => callback(new SystemProxyError('SYSTEM_PROXY_CONNECT_FAILED'), null),
                  );
                },
              }),
          }
        : {}),
      ...(proxy.username !== undefined || proxy.password !== undefined
        ? {
            token:
              'Basic ' +
              Buffer.from((proxy.username ?? '') + ':' + (proxy.password ?? '')).toString('base64'),
          }
        : {}),
    });
    return {
      dispatcher,
      close: async () => {
        await closeTunnels();
        await dispatcher.destroy();
      },
    };
  }
  const sockets = new Set<net.Socket>();
  const track = <T extends net.Socket>(socket: T): T => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  const abort = () => {
    for (const socket of sockets) socket.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  const dispatcher = new Agent({
    connections: 1,
    connect: (options, callback) => {
      let stage: 'tcp' | 'socks' | 'tls' = 'tcp';
      void (async () => {
        signal.throwIfAborted();
        observe?.('proxy-connect');
        if (options.protocol !== 'https:') throw new Error('HTTPS_TARGET_REQUIRED');
        // Only the proxy hostname is resolved locally. SOCKS5 carries the destination domain (ATYP 3).
        const socket = upstream
          ? await connectUpstream()
          : track(
              net.connect({
                host: address.hostname.replace(/^\[|\]$/g, ''),
                port: Number(address.port),
              }),
            );
        if (!upstream) await once(socket, 'connect', { signal });
        signal.throwIfAborted();
        stage = 'socks';
        observe?.('proxy-tunnel');
        const connected = await SocksClient.createConnection({
          command: 'connect',
          proxy: {
            host: address.hostname.replace(/^\[|\]$/g, ''),
            port: Number(address.port),
            type: 5,
            userId: proxy.username,
            password: proxy.password,
          },
          destination: { host: options.hostname, port: Number(options.port) || 443 },
          existing_socket: socket,
          timeout: PROXY_REQUEST_TIMEOUT_MS,
        });
        signal.throwIfAborted();
        stage = 'tls';
        observe?.('target-tls');
        const secure = track(
          tls.connect({
            socket: connected.socket,
            servername: options.hostname,
            rejectUnauthorized: true,
            ALPNProtocols: ['http/1.1'],
          }),
        );
        await once(secure, 'secureConnect', { signal });
        observe?.('connected');
        return secure;
      })().then(
        (socket) => callback(null, socket),
        (error: unknown) => {
          abort();
          if (error instanceof SystemProxyError) {
            callback(error, null);
            return;
          }
          const code = (error as NodeJS.ErrnoException)?.code;
          const message = error instanceof Error ? error.message : '';
          const reason =
            stage === 'tls'
              ? code === 'ECONNRESET'
                ? 'TARGET_TLS_RESET'
                : 'TARGET_TLS_FAILED'
              : stage === 'tcp'
                ? 'PROXY_CONNECT_FAILED'
                : message === 'Socks5 Authentication failed'
                  ? 'PROXY_AUTH_FAILED'
                  : 'PROXY_TUNNEL_FAILED';
          // Never attach the original SOCKS error: it contains proxy credentials in options.
          callback(new ProxyConnectionError(reason), null);
        },
      );
    },
  });
  return {
    dispatcher,
    close: async () => {
      signal.removeEventListener('abort', abort);
      abort();
      await closeTunnels();
      await dispatcher.destroy();
    },
  };
}
