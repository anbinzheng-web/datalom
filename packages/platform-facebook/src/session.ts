import type { SessionSecret } from '@datalom/shared/runtime/contracts';
import type { Store } from '@datalom/shared/storage/store';
import { PlatformSessions } from '@datalom/shared/storage/sessions';
export interface FacebookSession extends SessionSecret {
  profileId: string;
  capturedAt: number;
  requestCounter: number;
}

export class FacebookSessions {
  private sessions: PlatformSessions<FacebookSession>;
  constructor(store: Store) {
    this.sessions = new PlatformSessions(store.sql, store.vault, 'facebook', 'profile');
  }
  replace(session: FacebookSession) {
    return this.sessions.replace(session.profileId, session);
  }
  acquire(id: string) {
    return this.sessions.acquire(id);
  }
  renew(id: string, lease: string) {
    return this.sessions.renew(id, lease);
  }
  save(session: FacebookSession, version: number, lease: string) {
    return this.sessions.save(session.profileId, session, lease, version);
  }
  release(id: string, lease: string, cooldown = 3000) {
    return this.sessions.release(id, lease, cooldown);
  }
  available() {
    return this.sessions.available();
  }
}
