import type { SessionSecret } from '@datalom/shared/runtime/contracts';
import type { Store } from '@datalom/shared/storage/store';
import { PlatformSessions } from '@datalom/shared/storage/sessions';
export interface XSession extends SessionSecret {
  profileId: string;
  partitionCookieJar?: string;
  capturedAt: number;
  requestCounter: number;
}

export class XSessions {
  private sessions: PlatformSessions<XSession>;
  constructor(store: Store) {
    this.sessions = new PlatformSessions(store.sql, store.vault, 'x', 'profile');
  }
  replace(session: XSession) {
    return this.sessions.replace(session.profileId, session);
  }
  acquire(id: string) {
    return this.sessions.acquire(id);
  }
  renew(id: string, lease: string) {
    return this.sessions.renew(id, lease);
  }
  save(session: XSession, version: number, lease: string) {
    return this.sessions.save(session.profileId, session, lease, version);
  }
  release(id: string, lease: string, cooldown = 3000) {
    return this.sessions.release(id, lease, cooldown);
  }
  available() {
    return this.sessions.available();
  }
}
