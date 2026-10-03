import { randomUUID } from 'node:crypto';
import { DatalomError, type ProxyEndpoint, type SessionSecret } from '../runtime/contracts.ts';
import { numbers, type Database } from './database.ts';
import type { Vault } from './crypto.ts';

export class Proxies {
  constructor(
    private db: Database,
    private vault: Vault,
  ) {}
  async import(endpoint: ProxyEndpoint): Promise<string> {
    const { protocol, port } = endpoint;
    const host = endpoint.host.trim().toLowerCase(),
      username = endpoint.username ?? '';
    if (
      !['http', 'https', 'socks5'].includes(protocol) ||
      !host ||
      /[\s/@?#]/.test(host) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new DatalomError('INVALID_INPUT', '代理配置无效');
    return this.db.transaction(async () => {
      await this.db.lock(JSON.stringify(['proxy', protocol, host, port, username]));
      const rows = await this.db.client.proxy.findMany({
        where: { protocol, host, port, username },
      });
      for (const row of rows) {
        const password = row.password ? row.password : '';
        if (password === (endpoint.password ?? '')) return row.id;
      }
      // Different credentials never mutate a proxy already used by other accounts.
      const id = randomUUID(),
        now = Date.now();
      await this.db.client.proxy.create({
        data: {
          id,
          protocol,
          host,
          port,
          username,
          password: endpoint.password ? endpoint.password : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return id;
    });
  }
  async endpoint(id: string): Promise<ProxyEndpoint> {
    const row = await this.db.client.proxy.findUniqueOrThrow({ where: { id } });
    return {
      protocol: row.protocol as ProxyEndpoint['protocol'],
      host: row.host,
      port: row.port,
      username: row.username || undefined,
      password: row.password ? row.password : undefined,
    };
  }
  async list() {
    return numbers(
      await this.db.client.proxy.findMany({
        select: {
          id: true,
          protocol: true,
          host: true,
          port: true,
          username: true,
          checkResult: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
  }
  async fromSecret(secret: SessionSecret): Promise<string | null> {
    const raw = secret.route?.account ?? (secret.configured.proxyInfo as any);
    if (!raw) return null;
    return this.import({
      protocol: String(
        raw.protocol ?? raw.proxyCategory,
      ).toLowerCase() as ProxyEndpoint['protocol'],
      host: String(raw.host ?? ''),
      port: Number(raw.port),
      username: raw.username ?? raw.proxyUserName,
      password: raw.password ?? raw.proxyPassword,
    });
  }
}

/** Transport receives an injected endpoint; stored credentials have one authoritative location. */
export function withoutProxy(secret: SessionSecret): SessionSecret {
  const stored = structuredClone(secret);
  delete stored.configured.proxyInfo;
  if (stored.route) delete (stored.route as Partial<typeof stored.route>).account;
  return stored;
}
