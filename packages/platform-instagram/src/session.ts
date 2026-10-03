import type { SessionSecret } from '@datalom/shared/runtime/contracts';
import type { Store } from '@datalom/shared/storage/store';
import { PlatformSessions } from '@datalom/shared/storage/sessions';
export interface InstagramSession extends SessionSecret {
  profileId: string;
  capturedAt: number;
  requestCounter: number;
}

export class InstagramSessions {
  private sessions: PlatformSessions<InstagramSession>;
  constructor(store: Store) {
    this.sessions = new PlatformSessions(store.sql, store.vault, 'instagram', 'profile');
  }
  replace(session: InstagramSession) {
    return this.sessions.replace(session.profileId, session);
  }
  acquire(id: string) {
    return this.sessions.acquire(id);
  }
  renew(id: string, lease: string) {
    return this.sessions.renew(id, lease);
  }
  save(session: InstagramSession, version: number, lease: string) {
    return this.sessions.save(session.profileId, session, lease, version);
  }
  release(id: string, lease: string, cooldown = 3000) {
    return this.sessions.release(id, lease, cooldown);
  }
  available() {
    return this.sessions.available();
  }
}
