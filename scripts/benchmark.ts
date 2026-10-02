import { artifactPath } from "@datalom/shared/runtime/paths";
import { dataDirectory } from "@datalom/shared/runtime/paths";
import { chainFixture, proxyGet } from "./checks/proxy-fixture.ts";
import { startRoute } from "@datalom/network-node/route";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
const dir = dataDirectory();
const chain = await chainFixture();
const route = await startRoute(
  {
    upstream: { protocol: "http", host: "127.0.0.1", port: chain.upstreamPort },
    account: {
      protocol: "http",
      host: "127.0.0.1",
      port: chain.downstreamPort,
    },
  },
  dir,
);
const rows: unknown[] = [];
try {
  for (const concurrency of [1, 5, 10, 20]) {
    let next = 0;
    const latencies: number[] = [];
    const cpu = process.cpuUsage(),
      start = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next++ < 200) {
          const t = performance.now();
          const status = await proxyGet(route.url, chain.targetPort);
          if (status !== 200) throw new Error("Controlled endpoint failed");
          latencies.push(performance.now() - t);
        }
      }),
    );
    const elapsed = performance.now() - start,
      used = process.cpuUsage(cpu);
    latencies.sort((a, b) => a - b);
    rows.push({
      concurrency,
      requests: latencies.length,
      rps: Math.round((latencies.length * 1000) / elapsed),
      p95Ms:
        Math.round(latencies[Math.floor(latencies.length * 0.95)] * 100) / 100,
      clientCpuMs: (used.user + used.system) / 1000,
      clientRssMB: Math.round(process.memoryUsage().rss / 1048576),
    });
  }
  const result = {
    kind: "controlled-two-hop-gost-http1",
    note: "Local synthetic 1 KiB response. Measures chain forwarding and Node client; not impit TLS/HTTP2, not TikTok capacity. CPU/RSS exclude GOST.",
    date: new Date().toISOString(),
    rows,
  };
  mkdirSync(resolve(artifactPath()), { recursive: true });
  writeFileSync(artifactPath("benchmark.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await route.stop();
  await chain.close();
}
