import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';

// Isolated smoke endpoint: CONNECT always terminates locally, never contacts TikTok.
export async function accountProxyFixture(directory: string) {
  const state = {
    calls: 0,
    expectedHeaders: {} as Record<string, string>,
    connects: 0,
    reject: false,
    socksConnects: 0,
    socksHosts: [] as string[],
    socksReject: false,
    socksHang: false,
    socksDisconnects: 0,
    socksTlsReset: false,
    destinationTypes: [] as number[],
    response: undefined as { status: number; body: unknown } | undefined,
    respond: undefined as ((url: URL) => { status: number; body: unknown }) | undefined,
  };
  const sockets = new Set<{ destroy(): unknown }>();
  const target = https.createServer(
    {
      key: readFileSync(join(directory, 'key.pem')),
      cert: readFileSync(join(directory, 'cert.pem')),
    },
    (req, res) => {
      state.calls++;
      if (!state.response && !state.respond) assert.equal(req.url, '/passport/web/account/info/');
      assert.equal(req.headers.cookie, 'sessionid=SMOKE_COOKIE_CANARY');
      assert.equal(req.headers['proxy-authorization'], undefined);
      for (const [key, value] of Object.entries(state.expectedHeaders))
        assert.equal(req.headers[key], value);
      res.setHeader('content-type', 'application/json');
      const response =
        state.respond?.(new URL(req.url!, 'https://www.tiktok.com')) ?? state.response;
      if (response) {
        res.statusCode = response.status;
        if (typeof response.body === 'string') {
          res.setHeader('content-type', 'text/html');
          res.end(response.body);
        } else res.end(JSON.stringify(response.body));
        return;
      }
      res.end(
        JSON.stringify({
          message: 'success',
          data: {
            user_id: '1234567890123456789',
            username: 'verified_tiktok',
            nickname: '已识别昵称',
            email: 'PRIVATE_EMAIL',
          },
        }),
      );
    },
  );
  const proxy = http.createServer();
  const socks = net.createServer((socket) => {
    sockets.add(socket);
    if (state.socksDisconnects > 0) {
      state.socksDisconnects--;
      socket.destroy();
      return;
    }
    if (state.socksHang) {
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      return;
    }
    let buffer = Buffer.alloc(0),
      stage = 0;
    const receive = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        assert.equal(buffer[0], 5);
        assert.ok(buffer.subarray(2, 2 + buffer[1]).includes(2));
        buffer = buffer.subarray(2 + buffer[1]);
        stage = 1;
        socket.write(Buffer.from([5, 2]));
      }
      if (stage === 1) {
        if (buffer.length < 2 || buffer.length < 3 + buffer[1]) return;
        const userLength = buffer[1],
          passwordLength = buffer[2 + userLength];
        if (buffer.length < 3 + userLength + passwordLength) return;
        assert.equal(buffer.subarray(2, 2 + userLength).toString(), 'fixture');
        assert.equal(
          buffer.subarray(3 + userLength, 3 + userLength + passwordLength).toString(),
          'PROXY_CANARY',
        );
        buffer = buffer.subarray(3 + userLength + passwordLength);
        stage = 2;
        if (state.socksReject) {
          socket.end(Buffer.from([1, 1]));
          return;
        }
        socket.write(Buffer.from([1, 0]));
      }
      if (stage === 2) {
        if (buffer.length < 5) return;
        assert.equal(buffer[0], 5);
        assert.equal(buffer[1], 1);
        state.destinationTypes.push(buffer[3]);
        assert.equal(buffer[3], 3);
        const length = buffer[4];
        if (buffer.length < 7 + length) return;
        const host = buffer.subarray(5, 5 + length).toString();
        assert.ok(
          ['www.tiktok.com', 'www.instagram.com', 'www.facebook.com', 'www.youtube.com'].includes(
            host,
          ),
          host,
        );
        state.socksHosts.push(host);
        assert.equal(buffer.readUInt16BE(5 + length), 443);
        state.socksConnects++;
        stage = 3;
        socket.off('data', receive);
        if (state.socksTlsReset) {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 1]));
          socket.once('data', () => socket.destroy());
          return;
        }
        const head = buffer.subarray(7 + length);
        const upstream = net.connect(
          (target.address() as net.AddressInfo).port,
          '127.0.0.1',
          () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 1]));
            if (head.length) upstream.write(head);
            socket.pipe(upstream);
            upstream.pipe(socket);
          },
        );
        sockets.add(upstream);
        socket.on('error', () => upstream.destroy());
        upstream.on('error', () => socket.destroy());
      }
    };
    socket.on('data', receive);
    socket.on('error', () => {});
  });
  proxy.on('connect', (req, socket, head) => {
    state.connects++;
    assert.equal(req.url, 'www.tiktok.com:443');
    assert.equal(
      req.headers['proxy-authorization'],
      'Basic ' + Buffer.from('fixture:PROXY_CANARY').toString('base64'),
    );
    if (state.reject) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const upstream = net.connect((target.address() as net.AddressInfo).port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    sockets.add(socket);
    sockets.add(upstream);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
  });
  target.listen(0, '127.0.0.1');
  await once(target, 'listening');
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  socks.listen(0, '127.0.0.1');
  await once(socks, 'listening');
  return {
    state,
    port: String((proxy.address() as net.AddressInfo).port),
    socksPort: String((socks.address() as net.AddressInfo).port),
    dropSockets: () => {
      for (const socket of sockets) socket.destroy();
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      target.closeAllConnections();
      proxy.closeAllConnections();
      await Promise.all([
        new Promise<void>((r) => target.close(() => r())),
        new Promise<void>((r) => proxy.close(() => r())),
        new Promise<void>((r) => socks.close(() => r())),
      ]);
    },
  };
}
