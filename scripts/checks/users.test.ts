import { expect, it } from 'vitest';
import { fixture } from './helpers.ts';

it('keeps admins and users in one table and only signs in whitelisted emails', async () => {
  const f = await fixture();
  try {
    await expect(
      async () =>
        await f.store.signInWithProvider({
          provider: 'google',
          subject: 'g-1',
          email: 'stranger@example.com',
          name: 'Stranger',
        }),
    ).rejects.toThrow(/白名单/);
    await expect(async () => await f.store.allowEmail('ada@partner.test')).rejects.toThrow(/域名/);

    const gmail = await f.store.signInWithProvider({
      provider: 'google',
      subject: 'g-mail',
      email: 'Ada@Gmail.com',
      name: 'Ada',
    });
    expect(gmail.user.role).toBe('user');
    expect(gmail.user.email).toBe('ada@gmail.com');
    await expect(
      async () =>
        await f.store.signInWithProvider({
          provider: 'google',
          subject: 'g-sub',
          email: 'ada@mail.gmail.com',
          name: 'Sub',
        }),
    ).rejects.toThrow(/白名单/);
    expect((await f.store.signInWithPassword('admin@datalom.com', '12345678')).user.role).toBe(
      'admin',
    );

    const admin = await f.store.sql.client.user.findFirstOrThrow({ where: { email: 'admin@datalom.com' } });
    const [kind, salt, digest] = admin.passwordHash!.split(':');
    expect(kind).toBe('scrypt');
    expect(Buffer.from(salt, 'base64url')).toHaveLength(16);
    expect(Buffer.from(digest, 'base64url')).toHaveLength(32);
    await expect(f.store.signInWithPassword('admin@datalom.com', 'wrong-password')).rejects.toThrow();
    await f.store.allowEmail('@partner.test');
    const member = await f.store.signInWithProvider({
      provider: 'github',
      subject: 'gh-1',
      email: 'ada@partner.test',
      name: 'Ada',
    });
    expect(member.user.role).toBe('user');
    await f.store.removeAllowedEmail('partner.test');
    await expect(
      async () =>
        await f.store.signInWithProvider({
          provider: 'github',
          subject: 'gh-2',
          email: 'bob@partner.test',
          name: 'Bob',
        }),
    ).rejects.toThrow(/白名单/);
    expect((await f.store.userForSession(member.sessionId))?.email).toBe('ada@partner.test');
  } finally {
    await f.cleanup();
  }
});
