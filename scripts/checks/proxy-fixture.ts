import { createServer as httpServer, get } from "node:http";
import { connect, type Socket } from "node:net";
import type { Server } from "node:http";
export async function listen(s: Server): Promise<number> {
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () => resolve((s.address() as any).port)),
  );
}
export async function chainFixture() {
  const events: string[] = [],
    sockets = new Set<Socket>();
  let requests = 0;
  const track = (s: Server) =>
    s.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
  const destination = httpServer((_, r) => {
    requests++;
    r.setHeader("Content-Type", "application/json");
    r.end(JSON.stringify({ ok: true, payload: "x".repeat(1024) }));
  });
  track(destination);
  const targetPort = await listen(destination);
  const proxy = (name: string) => {
    const s = httpServer();
    track(s);
    s.on("connect", (req, client, head) => {
      events.push(`${name}:${req.url}`);
      const [host, port] = req.url!.split(":");
      const remote = connect({ host, port: Number(port) }, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) remote.write(head);
        client.pipe(remote);
        remote.pipe(client);
      });
      sockets.add(remote);
      remote.on("close", () => sockets.delete(remote));
      remote.on("error", () => client.destroy());
      client.on("error", () => remote.destroy());
      client.on("close", () => remote.destroy());
    });
    return s;
  };
  const downstream = proxy("account"),
    downstreamPort = await listen(downstream),
    upstream = proxy("upstream"),
    upstreamPort = await listen(upstream);
  const close = async (s: Server) => {
    await new Promise<void>((resolve) => s.close(() => resolve()));
  };
  return {
    events,
    targetPort,
    upstreamPort,
    downstreamPort,
    requests: () => requests,
    async breakUpstream() {
      for (const socket of sockets) socket.destroy();
      await close(upstream);
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        close(destination),
        close(downstream),
        close(upstream),
      ]);
    },
  };
}
export async function proxyGet(
  proxyUrl: string,
  targetPort: number,
): Promise<number> {
  const p = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const r = get(
      {
        hostname: p.hostname,
        port: p.port,
        path: `http://127.0.0.1:${targetPort}/fixture`,
        headers: { host: `127.0.0.1:${targetPort}` },
        timeout: 4000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      },
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
  });
}
