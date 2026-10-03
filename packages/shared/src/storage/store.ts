import { Proxies, withoutProxy } from './proxies.ts';
import { accountIntervalMs } from '../runtime/config.ts';
import { Wallets } from './wallets.ts';
import { MemoryRate } from './memory-rate.ts';
import { Metrics } from './metrics.ts';
import { SignJWT, jwtVerify } from 'jose';
import { Database, numbers } from './database.ts';
import { mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { Vault } from './crypto.ts';
import { Diagnostics } from './diagnostics.ts';
import {
  DatalomError,
  type Account,
  type AccountStatus,
  type SessionSecret,
} from '../runtime/contracts.ts';

export class Store {
  diagnostics: Diagnostics;
  private readonly intervalMs = accountIntervalMs();
  private strikes = new Map<string, { count: number; expires: number }>();
  private leases = new Map<string, { token: string; until: number }>();
  private nextAt = new Map<string, number>();
  private versions = new Map<string, number>();
  readonly wallets: Wallets;
  readonly proxies: Proxies;
  private rate = new MemoryRate();
  readonly observations: Metrics;
  sql: Database;
  constructor(
    public dir: string,
    public vault: Vault,
    database = new Database(),
  ) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    this.sql = database;
    this.proxies = new Proxies(database, vault);
    this.wallets = new Wallets(database);
    this.diagnostics = new Diagnostics(this.vault, dir);
    this.observations = new Metrics(dir);
  }
  async initialize(): Promise<void> {
    for (const domain of [
      'gmail.com',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'icloud.com',
      'me.com',
      'yahoo.com',
      'qq.com',
      '163.com',
      '126.com',
    ]) {
      await this.sql.execute(
        'INSERT INTO email_whitelist(email,"createdAt") VALUES ($1,$2) ON CONFLICT DO NOTHING',
        `@${domain}`,
        Date.now(),
      );
    }
    await this.sql.transaction(async () => {
      await this.sql.lock('user-admin-initialize');
      const admin = (await this.sql.one(
        'SELECT id, "passwordHash" FROM users WHERE email=$1',
        'admin@datalom.com',
      )) as { id: string; passwordHash: string | null } | undefined;
      const now = Date.now();
      const id = admin?.id ?? randomUUID();
      if (!admin) {
        await this.sql.execute(
          'INSERT INTO users(id,email,role,name,"avatarUrl","createdAt","updatedAt",disabled) VALUES ($1,$2,$3,$4,$5,$6,$7,0)',
          id,
          'admin@datalom.com',
          'admin',
          'Admin',
          '',
          now,
          now,
        );
      }
      if (!admin?.passwordHash) {
        await this.sql.execute(
          'UPDATE users SET "passwordHash"=$2,"updatedAt"=$3 WHERE id=$1',
          id,
          hashPassword('12345678'),
          now,
        );
        await this.sql.execute(
          'UPDATE users SET role=\'admin\', "updatedAt"=$1 WHERE id=$2',
          now,
          id,
        );
      }
    });
  }
  async listAccounts(): Promise<Account[]> {
    const rows = numbers(
      await this.sql.client.platformAccount.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
    );
    return rows.map((row: any) => {
      const { payload, ...account } = row;
      return {
        ...account,
        profileId: account.source?.id,
        workspaceId: account.source?.workspaceId,
        browserNumber: account.source?.browserNumber,
        version: this.versions.get(account.id) ?? 1,
      };
    }) as Account[];
  }

  async getAccount(id: string): Promise<Account> {
    const row = numbers(
      await this.sql.client.platformAccount.findUnique({
        where: { id },
      }),
    );
    if (!row) throw new DatalomError('INVALID_INPUT', '账号不存在');
    const { payload, ...account } = row;
    return {
      ...account,
      profileId: account.source?.id,
      workspaceId: account.source?.workspaceId,
      browserNumber: account.source?.browserNumber,
      version: this.versions.get(account.id) ?? 1,
    } as Account;
  }

  async getSecret(id: string): Promise<SessionSecret> {
    const row = await this.sql.client.platformAccount.findUnique({ where: { id } });
    if (!row) throw new DatalomError('INVALID_INPUT', '账号会话不存在');
    const secret = this.vault.open<SessionSecret>(
      typeof (row.payload as any)?.ciphertext === 'string'
        ? (row.payload as any).ciphertext
        : JSON.stringify(row.payload),
      `account:${id}`,
    );
    const account = row;
    const clean = withoutProxy(secret);
    if (account.proxyId)
      clean.route = { ...clean.route, account: await this.proxies.endpoint(account.proxyId) };
    else delete clean.route;
    return clean;
  }
  async importAccount(
    input: {
      platform?: string;
      profileId?: string;
      workspaceId?: string;
      source?: Record<string, unknown>;
      label?: string;
      identity: string;
    },
    secret: SessionSecret,
  ): Promise<Account> {
    return await this.sql.transaction(async () => {
      await this.sql.lock(
        JSON.stringify([
          'account-import',
          input.platform ?? 'tiktok',
          input.source?.id ?? input.profileId ?? '',
        ]),
      );
      const old = (await this.sql.one(
        "SELECT * FROM platform_accounts WHERE platform=$1 AND source->>'id'=$2",
        input.platform ?? 'tiktok',
        input.source?.id ?? input.profileId ?? '',
      )) as any;
      if (old) {
        await this.sql.lock(`account-session:${old.id}`);
        if ((this.leases.get(old.id)?.until ?? 0) > Date.now())
          throw new DatalomError('CONFLICT', '账号正在执行请求，请结束请求后重新提取');
      }
      const id = old?.id ?? randomUUID(),
        now = Date.now();
      const values = {
        platform: 'tiktok',
        source: (input.source ?? {
          type: 'roxybrowser',
          id: input.profileId,
          workspaceId: input.workspaceId,
        }) as any,
        identity: input.identity,
        ...(input.platform ? { platform: input.platform } : {}),
        proxyId: await this.proxies.fromSecret(secret),
        status: 'pending',
        updatedAt: now,
      };
      await this.sql.client.platformAccount.upsert({
        where: { id },
        create: { id, ...values },
        update: {
          ...values,
          validatedAt: null,
        },
      });
      const payload = JSON.parse(JSON.stringify(withoutProxy(secret)));
      await this.sql.client.platformAccount.update({
        where: { id },
        data: { payload },
      });
      return await this.getAccount(id);
    });
  }
  async saveSecret(
    id: string,
    version: number,
    secret: SessionSecret,
    lease: string,
    identity?: string,
  ): Promise<void> {
    await this.sql.transaction(async () => {
      await this.sql.lock(`account-session:${id}`);
      const result = await this.sql.client.platformAccount.updateMany({
        where: { id },
        data: { payload: JSON.parse(JSON.stringify(withoutProxy(secret))) },
      });
      if (
        !this.leases.get(id) ||
        this.leases.get(id)?.token !== lease ||
        (this.leases.get(id)?.until ?? 0) <= Date.now() ||
        (this.versions.get(id) ?? 1) !== version
      )
        throw new DatalomError('CONFLICT', '会话版本或租约已变化，拒绝覆盖');
      await this.sql.client.platformAccount.update({
        where: { id },
        data: { updatedAt: Date.now(), ...(identity === undefined ? {} : { identity }) },
      });
    });
  }

  async patchAccount(id: string, patch: { status?: AccountStatus }): Promise<void> {
    await this.getAccount(id);
    await this.sql.client.platformAccount.update({
      where: { id },
      data: { ...patch, updatedAt: Date.now() },
    });
  }
  async status(id: string, status: AccountStatus, reason = '', cooldownMs = 0): Promise<void> {
    await this.sql.transaction(async () => {
      await this.sql.lock(`account-session:${id}`);
      await this.sql.execute(
        'UPDATE platform_accounts SET status=CASE WHEN status=\'disabled\' THEN status ELSE $1 END,"validatedAt"=CASE WHEN $1=\'ready\' THEN $2 ELSE "validatedAt" END WHERE id=$3',
        status,
        Date.now(),
        id,
      );
      if (cooldownMs > 0)
        await this.sql.execute(
          'UPDATE platform_accounts SET "nextAt"=GREATEST("nextAt",$1) WHERE id=$2',
          Date.now() + cooldownMs,
          id,
        );
    });
    if (reason)
      await this.diagnostics.event({ accountId: id }, 'account-status', status, { reason });
  }
  async lease(id: string, allowPending = false): Promise<string | null> {
    return this.sql.transaction(async () => {
      await this.sql.lock(`account-session:${id}`);
      const token = randomUUID(),
        now = Date.now();
      const account = await this.sql.client.platformAccount.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!account || (this.leases.get(id)?.until ?? 0) > now || (this.nextAt.get(id) ?? 0) > now)
        return null;
      this.leases.set(id, { token, until: now + 60000 });
      return token;
    });
  }
  async renew(id: string, token: string): Promise<boolean> {
    return (
      (this.leases.get(id)?.token === token && this.leases.get(id)!.until > Date.now()
        ? ((this.leases.get(id)!.until = Date.now() + 60000), { count: 1 })
        : { count: 0 }
      ).count === 1
    );
  }
  async release(id: string, token: string): Promise<void> {
    if (this.leases.get(id)?.token === token) this.leases.delete(id);
  }
  async accountPolicy(id: string) {
    await this.getAccount(id);
    return { minIntervalMs: this.intervalMs };
  }
  async coolDownAccount(id: string, reason: string) {
    const now = Date.now();
    for (const [key, value] of this.strikes) if (value.expires <= now) this.strikes.delete(key);
    const count = Math.min((this.strikes.get(id)?.count ?? 0) + 1, 7);
    if (this.strikes.size < 10000 || this.strikes.has(id))
      this.strikes.set(id, { count, expires: now + 3600000 });
    await this.status(id, 'cooldown', reason, Math.min(3600000, 60000 * 2 ** (count - 1)));
  }
  async resetRateStrikes(id: string) {
    this.strikes.delete(id);
  }
  async scheduleNext(id: string, token: string, cooldownMs?: number): Promise<void> {
    this.nextAt.set(
      id,
      Math.max(this.nextAt.get(id) ?? 0, Date.now() + (cooldownMs ?? this.intervalMs)),
    );
  }
  async reserveRate(id: string, lease: string, operation: string): Promise<number> {
    const row = await this.sql.one(
      'SELECT "nextAt",platform FROM platform_accounts WHERE id=$1 AND lease=$2 AND "leaseUntil">$3',
      id,
      lease,
      Date.now(),
    );
    if (!row) throw new DatalomError('CONFLICT', '账号租约已过期');
    const route = (await this.getSecret(id)).route;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(route?.account ?? { id }))
      .digest('hex');
    const now = Date.now();
    const at = this.rate.reserve(
      [
        [`account:${id}`, this.intervalMs],
        [`proxy:${fingerprint}`, 100],
        [`operation:${row.platform}:${operation}`, 50],
      ],
      row.nextAt,
      now,
    );
    return Math.max(0, at - now);
  }
  async getProxyCheck<T = unknown>(id: string): Promise<T | undefined> {
    const row = await this.sql.client.platformAccount.findUniqueOrThrow({
      where: { id },
      include: { proxy: true },
    });
    return (row.proxy?.checkResult ?? undefined) as T | undefined;
  }
  async setProxyCheck(id: string, value: unknown) {
    const row = await this.sql.client.platformAccount.findUniqueOrThrow({ where: { id } });
    if (!row.proxyId) throw new DatalomError('PROXY_UNAVAILABLE', '账号未关联代理');
    await this.sql.execute(
      'UPDATE proxies SET "checkResult"=$1::jsonb,"updatedAt"=$2 WHERE id=$3',
      JSON.stringify(value),
      Date.now(),
      row.proxyId,
    );
  }
  async consumeRate(scope: string, bucket: number, limit: number): Promise<boolean> {
    return this.rate.consume(scope, bucket, limit);
  }
  async getPlatformCache<T>(platform: string, key: string): Promise<T | undefined> {
    try {
      const values = JSON.parse(
        readFileSync(join(this.dir, 'platform-cache.json'), 'utf8'),
      ) as Record<string, T>;
      const value = values[`${platform}:${key}`];
      return value;
    } catch {
      return undefined;
    }
  }
  async setPlatformCache(platform: string, key: string, value: unknown) {
    const file = join(this.dir, 'platform-cache.json');
    let values: Record<string, unknown> = {};
    try {
      values = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* first write */
    }
    values[`${platform}:${key}`] = value;
    writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
  }
  async evidence(
    accountId: string | null,
    kind: string,
    summary: string,
    payload: unknown,
  ): Promise<string> {
    return this.diagnostics.evidence(accountId, kind, summary, payload);
  }
  async listEvidence(): Promise<unknown[]> {
    return this.diagnostics.listEvidence();
  }
  async metrics() {
    return this.observations.snapshot();
  }
  private closing?: Promise<void>;
  close(): Promise<void> {
    return (this.closing ??= this.closeResources());
  }
  private async closeResources(): Promise<void> {
    const results = await Promise.allSettled([
      this.diagnostics.close(),
      this.observations.close(),
      this.sql.close(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  async allowEmail(domain: string): Promise<void> {
    const normalized = normalizeWhitelist(domain);
    await this.sql.execute(
      'INSERT INTO email_whitelist(email,"createdAt") VALUES ($1,$2) ON CONFLICT(email) DO NOTHING',
      normalized,
      Date.now(),
    );
  }

  async removeAllowedEmail(email: string): Promise<void> {
    await this.sql.execute('DELETE FROM email_whitelist WHERE email=$1', normalizeWhitelist(email));
  }

  async listAllowedEmails(): Promise<{ email: string; createdAt: number }[]> {
    return (await this.sql.many(
      'SELECT email,"createdAt" FROM email_whitelist ORDER BY "createdAt" DESC',
    )) as { email: string; createdAt: number }[];
  }

  async listUsers(): Promise<
    {
      id: string;
      email: string;
      role: 'admin' | 'user';
      name: string;
      avatarUrl: string;
      createdAt: number;
      disabled: number;
      providers: string;
    }[]
  > {
    return (await this.sql.many(
      'SELECT u.id,u.email,u.role,u.name,u."avatarUrl",u."createdAt",u.disabled,\n                COALESCE(STRING_AGG(i.provider, \',\'), \'\') providers\n         FROM users u LEFT JOIN user_identities i ON i."userId"=u.id\n         GROUP BY u.id ORDER BY u."createdAt" DESC',
    )) as {
      id: string;
      email: string;
      role: 'admin' | 'user';
      name: string;
      avatarUrl: string;
      createdAt: number;
      disabled: number;
      providers: string;
    }[];
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ sessionId: string; user: PublicUser }> {
    const normalized = normalizeEmail(email);
    const row = (await this.sql.one(
      'SELECT id, "passwordHash", disabled, role, "authVersion" FROM users WHERE email=$1',
      normalized,
    )) as
      | {
          id: string;
          passwordHash: string | null;
          disabled: number;
          role: string;
          authVersion: number;
        }
      | undefined;
    if (
      !row ||
      row.disabled ||
      row.role !== 'admin' ||
      !row.passwordHash ||
      !verifyPassword(password, row.passwordHash)
    )
      throw new DatalomError('LOGIN_REQUIRED', '邮箱或密码不正确');
    const sessionId = await this.issueUserToken(row.id, row.authVersion);
    const user = await this.publicUser(row.id);
    if (!user) throw new DatalomError('LOGIN_REQUIRED', '邮箱或密码不正确');
    return { sessionId, user };
  }

  async signInWithProvider(input: {
    provider: 'google' | 'github';
    subject: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  }): Promise<{ sessionId: string; user: PublicUser }> {
    if (input.provider !== 'google' && input.provider !== 'github')
      throw new DatalomError('INVALID_INPUT', '不支持的登录方式');
    if (!input.subject || input.subject.length > 200)
      throw new DatalomError('INVALID_INPUT', '第三方身份无效');
    const email = normalizeEmail(input.email);
    const allowed = await this.emailDomainAllowed(email);
    return await this.sql.transaction(async () => {
      await this.sql.lock(`provider-email:${email}`);
      await this.sql.lock(`provider:${input.provider}:${input.subject}`);
      const existing = (await this.sql.one(
        'SELECT "userId" FROM user_identities WHERE provider=$1 AND subject=$2',
        input.provider,
        input.subject,
      )) as { userId: string } | undefined;
      const now = Date.now();
      let userId = existing?.userId;
      if (!userId) {
        const byEmail = (await this.sql.one(
          'SELECT id,disabled FROM users WHERE email=$1',
          email,
        )) as { id: string; disabled: number } | undefined;
        if (byEmail?.disabled) throw new DatalomError('CONFLICT', '账号已停用');
        userId = byEmail?.id ?? randomUUID();
        if (!byEmail) {
          if (!allowed) throw new DatalomError('CONFLICT', '这个邮箱的域名不在白名单里');
          await this.sql.execute(
            'INSERT INTO users(id,email,role,name,"avatarUrl","createdAt","updatedAt",disabled) VALUES ($1,$2,$3,$4,$5,$6,$7,0)',
            userId,
            email,
            'user',
            input.name ?? '',
            input.avatarUrl ?? '',
            now,
            now,
          );
        }
        await this.sql.execute(
          'INSERT INTO user_identities(provider,subject,"userId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5)',
          input.provider,
          input.subject,
          userId,
          now,
          now,
        );
      }
      await this.sql.execute(
        'UPDATE users SET name=$1, "avatarUrl"=$2, "updatedAt"=$3 WHERE id=$4 AND disabled=0',
        input.name ?? '',
        input.avatarUrl ?? '',
        now,
        userId,
      );
      const user = await this.publicUser(userId);
      if (!user) throw new DatalomError('CONFLICT', '账号已停用');
      const row = await this.sql.client.user.findUniqueOrThrow({ where: { id: user.id } });
      const sessionId = await this.issueUserToken(user.id, row.authVersion);
      return { sessionId, user };
    });
  }

  private async issueUserToken(userId: string, authVersion: number): Promise<string> {
    return new SignJWT({ authVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('datalom')
      .setAudience('datalom:user')
      .setIssuedAt()
      .setExpirationTime('14d')
      .setJti(randomUUID())
      .sign(this.vault.userSigningKey());
  }

  async userForSession(sessionId: string): Promise<PublicUser | null> {
    if (!sessionId) return null;
    let payload;
    try {
      ({ payload } = await jwtVerify(sessionId, this.vault.userSigningKey(), {
        algorithms: ['HS256'],
        issuer: 'datalom',
        audience: 'datalom:user',
        typ: 'JWT',
        requiredClaims: ['sub', 'iat', 'exp', 'authVersion'],
      }));
    } catch {
      return null;
    }
    if (!payload.sub || !Number.isSafeInteger(payload.authVersion)) return null;
    const row = await this.sql.client.user.findUnique({ where: { id: payload.sub } });
    if (!row || row.disabled || row.authVersion !== payload.authVersion) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role as PublicUser['role'],
      name: row.name,
      avatarUrl: row.avatarUrl,
    };
  }

  /** Internal operation for logout-all and future password-reset flows. */
  async revokeUserTokens(userId: string): Promise<void> {
    await this.sql.client.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 }, updatedAt: Date.now() },
    });
  }

  private async emailDomainAllowed(email: string): Promise<boolean> {
    const host = email.split('@')[1] ?? '';
    return (await this.listAllowedEmails()).some((row) => row.email === `@${host}`);
  }

  private async publicUser(id: string): Promise<PublicUser | null> {
    const row = (await this.sql.one(
      'SELECT id,email,role,name,"avatarUrl",disabled FROM users WHERE id=$1',
      id,
    )) as (PublicUser & { disabled: number }) | undefined;
    if (!row || row.disabled) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      name: row.name,
      avatarUrl: row.avatarUrl,
    };
  }
}

export type PublicUser = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  name: string;
  avatarUrl: string;
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('base64url')}`;
}

function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200)
    throw new DatalomError('INVALID_INPUT', '邮箱格式不正确');
  return value;
}

function normalizeWhitelist(domain: string): string {
  const value = domain.trim().toLowerCase().replace(/^@/, '');
  if (value.includes('@') || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value))
    throw new DatalomError('INVALID_INPUT', '请填写邮箱域名，例如 @gmail.com');
  return `@${value}`;
}
