import { SignJWT, decodeJwt } from 'jose';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { fixture } from '../../../../scripts/checks/helpers.ts';
import { Database } from '../storage/database.ts';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');

it('uses signed JWTs, checks expiry, disabled state and global revocation without session rows', async () => {
  const f = await fixture();
  try {
    const login = await f.store.signInWithPassword(' ADMIN@DATALOM.COM ', '12345678');
    expect(decodeJwt(login.sessionId).sub).toBe(login.user.id);
    expect((await f.store.userForSession(login.sessionId))?.id).toBe(login.user.id);
    const row = await f.store.sql.client.user.findUniqueOrThrow({ where: { id: login.user.id } });
    expect(row.passwordHash).toMatch(/^scrypt:/);
    expect(JSON.stringify(login)).not.toContain('passwordHash');
    await expect(f.store.signInWithPassword(login.user.email, 'wrong')).rejects.toThrow();
    expect(await f.store.userForSession('old-opaque-session')).toBeNull();
    const parts = login.sessionId.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ ...decodeJwt(login.sessionId), sub: 'other' }),
    ).toString('base64url');
    expect(await f.store.userForSession(parts.join('.'))).toBeNull();
    const makeToken = (audience: string, expiry: number, key = f.store.vault.userSigningKey()) =>
      new SignJWT({ authVersion: row.authVersion })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(row.id)
        .setIssuer('datalom')
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(key);
    expect(await f.store.userForSession(await makeToken('datalom:user', 1))).toBeNull();
    expect(
      await f.store.userForSession(await makeToken('other', Math.floor(Date.now() / 1000) + 60)),
    ).toBeNull();
    expect(
      await f.store.userForSession(
        await makeToken('datalom:user', Math.floor(Date.now() / 1000) + 60, Buffer.alloc(32)),
      ),
    ).toBeNull();
    await f.store.sql.client.user.update({ where: { id: row.id }, data: { disabled: 1 } });
    expect(await f.store.userForSession(login.sessionId)).toBeNull();
    await f.store.sql.client.user.update({ where: { id: row.id }, data: { disabled: 0 } });
    const other = await f.store.signInWithPassword(login.user.email, '12345678');
    await f.store.revokeUserTokens(row.id);
    expect(await f.store.userForSession(login.sessionId)).toBeNull();
    expect(await f.store.userForSession(other.sessionId)).toBeNull();
    const fresh = await f.store.signInWithPassword(login.user.email, '12345678');
    expect((await f.store.userForSession(fresh.sessionId))?.id).toBe(row.id);
    const tables = await f.store.sql.many<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND (table_name='users' OR table_name LIKE 'user_%')",
    );
    expect(tables.map((r) => r.table_name).sort()).toEqual([
      'user_api_keys',
      'user_email_tokens',
      'user_identities',
      'users',
    ]);
  } finally {
    await f.cleanup();
  }
});
it('enforces user, identity, token and key constraints and cascades deletion', async () => {
  const f = await fixture();
  try {
    const { user } = await f.store.signInWithProvider({
      provider: 'github',
      subject: 'Case',
      email: 'person@gmail.com',
    });
    const db = f.store.sql;
    await expect(
      db.execute('UPDATE users SET role=$1 WHERE id=$2', 'owner', user.id),
    ).rejects.toThrow();
    await expect(db.execute('UPDATE users SET disabled=2 WHERE id=$1', user.id)).rejects.toThrow();
    await expect(
      db.execute('UPDATE users SET email=$1 WHERE id=$2', ' Person@gmail.com ', user.id),
    ).rejects.toThrow();
    await expect(
      db.execute('INSERT INTO user_identities VALUES ($1,$2,$3,1,1)', 'github', 'Case', user.id),
    ).rejects.toThrow();
    await db.execute(
      'INSERT INTO user_identities VALUES ($1,$2,$3,1,1)',
      'github',
      'case',
      user.id,
    );
    await expect(
      db.execute(
        'INSERT INTO user_identities VALUES ($1,$2,$3,1,1)',
        'github',
        'unknown',
        'missing',
      ),
    ).rejects.toThrow();
    const token = async (id: string, purpose: string, hash: string) =>
      await db.execute(
        'INSERT INTO user_email_tokens(id,"userId",purpose,email,"tokenHash","createdAt","expiresAt") VALUES ($1,$2,$3,$4,$5,1,100)',
        id,
        user.id,
        purpose,
        user.email,
        hash,
      );
    await token('a', 'verify_email', digest('email'));
    await expect(token('b', 'verify_email', digest('email'))).rejects.toThrow();
    await expect(token('c', 'invalid', digest('other'))).rejects.toThrow();
    const key = async (id: string, hash: string) =>
      await db.execute(
        'INSERT INTO user_api_keys(id,"userId",name,"keyHash","keyPrefix","keyLast4","createdAt") VALUES ($1,$2,$3,$4,$5,$6,1)',
        id,
        user.id,
        'key',
        hash,
        'dl_',
        '1234',
      );
    await key('k', digest('key'));
    await key('k2', digest('key2'));
    await expect(key('k3', digest('key'))).rejects.toThrow();
    await db.execute('DELETE FROM users WHERE id=$1', user.id);
    for (const table of ['user_identities', 'user_email_tokens', 'user_api_keys'])
      expect(await db.many(`SELECT * FROM ${table} WHERE "userId"=$1`, user.id)).toEqual([]);
  } finally {
    await f.cleanup();
  }
});
it('allows only one lease across separate PostgreSQL connections and rejects stale writes', async () => {
  const f = await fixture(),
    second = new Database(f.url);
  try {
    await f.store.status(f.account.id, 'ready');
    const tokens = await Promise.all(
      Array.from({ length: 8 }, async () => await f.store.lease(f.account.id)),
    );
    expect(tokens.filter(Boolean)).toHaveLength(1);
    await expect(
      f.store.saveSecret(
        f.account.id,
        999,
        await f.store.getSecret(f.account.id),
        tokens.find(Boolean)!,
      ),
    ).rejects.toThrow();
    const result = await second.execute(
      'UPDATE platform_accounts SET lease=$1 WHERE "id"=$2 AND (lease IS NULL OR "leaseUntil"<$3)',
      'other',
      f.account.id,
      Date.now(),
    );
    expect(result.changes).toBe(0);
  } finally {
    await second.close();
    await f.cleanup();
  }
});
