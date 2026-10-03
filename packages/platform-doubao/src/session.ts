import { PlatformSessions } from '@datalom/shared/storage/sessions';
import { CookieJar } from 'tough-cookie';
import type { Store } from '@datalom/shared/storage/store';
import { assertDoubaoAnonymousCookies } from './anonymous.ts';

export interface DoubaoConversation {
  id: string;
  sectionId: string;
  lastMessageIndex: number;
}
export interface DoubaoSession {
  id: string;
  createdAt: number;
  provenance: 'captured-guest' | 'node-bootstrap';
  seedEvidenceId?: string;
  userAgent: string;
  params: Record<string, string>;
  cookieJar: NonNullable<Awaited<ReturnType<CookieJar['serializeSync']>>>;
  conversation?: DoubaoConversation;
  lastSuccessAt?: number;
  lastResult?: string;
  tokenUpdatedAt?: number;
  candidateMsToken?: string;
  candidateTokenAt?: number;
  candidateTokenResult?: string;
}
export function assertGuestJar(jar: CookieJar) {
  assertDoubaoAnonymousCookies(
    jar
      .getCookiesSync('https://www.doubao.com/chat/completion')
      .map((c) => ({ name: c.key, value: c.value })),
  );
}

export class DoubaoSessions {
  private sessions: PlatformSessions<DoubaoSession>;
  constructor(store: Store) {
    this.sessions = new PlatformSessions(store.sql, store.vault, 'doubao', 'guest', 300000);
  }
  async create(session: DoubaoSession) {
    assertGuestJar(CookieJar.deserializeSync(session.cookieJar));
    await this.sessions.replace(session.id, session, true);
  }
  exists(id: string) {
    return this.sessions.exists(id);
  }
  acquire(id: string) {
    return this.sessions.acquire(id);
  }
  renew(id: string, lease: string) {
    return this.sessions.renew(id, lease);
  }
  save(session: DoubaoSession, lease: string) {
    return this.sessions.save(session.id, session, lease);
  }
  release(id: string, lease: string, cooldown = 0) {
    return this.sessions.release(id, lease, cooldown);
  }
  available() {
    return this.sessions.available();
  }
}
