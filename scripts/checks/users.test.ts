import { expect, it } from 'vitest';
import { fixture } from './helpers.ts';

it('keeps admins and users in one table and only signs in whitelisted emails', () => {
  const f = fixture();
  try {
    expect(() =>
      f.store.signInWithProvider({
        provider: 'google',
        subject: 'g-1',
        email: 'stranger@example.com',
        name: 'Stranger',
      }),
    ).toThrow(/白名单/);
    expect(() => f.store.allowEmail('ada@partner.test')).toThrow(/域名/);

    const gmail = f.store.signInWithProvider({
      provider: 'google',
      subject: 'g-mail',
      email: 'Ada@Gmail.com',
      name: 'Ada',
    });
    expect(gmail.user.role).toBe('user');
    expect(gmail.user.email).toBe('ada@gmail.com');
    expect(() =>
      f.store.signInWithProvider({
        provider: 'google',
        subject: 'g-sub',
        email: 'ada@mail.gmail.com',
        name: 'Sub',
      }),
    ).toThrow(/白名单/);
    expect(f.store.signInWithPassword('admin@datalom.com', '12345678').user.role).toBe('admin');

    f.store.allowEmail('@partner.test');
    const member = f.store.signInWithProvider({
      provider: 'github',
      subject: 'gh-1',
      email: 'ada@partner.test',
      name: 'Ada',
    });
    expect(member.user.role).toBe('user');
    f.store.removeAllowedEmail('partner.test');
    expect(() =>
      f.store.signInWithProvider({
        provider: 'github',
        subject: 'gh-2',
        email: 'bob@partner.test',
        name: 'Bob',
      }),
    ).toThrow(/白名单/);
    expect(f.store.userForSession(member.sessionId)?.email).toBe('ada@partner.test');
  } finally {
    f.cleanup();
  }
});
