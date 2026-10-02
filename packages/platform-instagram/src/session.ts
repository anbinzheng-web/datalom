import { randomUUID } from "node:crypto";
import { DatalomError, type SessionSecret } from "@datalom/shared/runtime/contracts";
import type { Store } from "@datalom/shared/storage/store";
export interface InstagramSession extends SessionSecret {
  profileId: string;
  capturedAt: number;
  requestCounter: number;
}
export class InstagramSessions {
  constructor(private store: Store) {
    store.sql.exec(
      `CREATE TABLE IF NOT EXISTS instagram_sessions(profileId TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, lease TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL DEFAULT 0)`,
    );
  }
  replace(session: InstagramSession) {
    this.store.sql
      .transaction(() => {
        const row = this.store.sql
          .prepare("SELECT * FROM instagram_sessions WHERE profileId=?")
          .get(session.profileId) as any;
        if (row?.leaseUntil > Date.now())
          throw new DatalomError("CONFLICT", "Instagram 会话正在使用");
        this.store.sql
          .prepare(
            "INSERT INTO instagram_sessions(profileId,version,payload) VALUES(?,1,?) ON CONFLICT(profileId) DO UPDATE SET version=version+1,payload=excluded.payload,lease=NULL,leaseUntil=0",
          )
          .run(
            session.profileId,
            this.store.vault.seal(session, `instagram:${session.profileId}`),
          );
      })
      .immediate();
  }
  acquire(profileId: string) {
    return this.store.sql
      .transaction(() => {
        const row = this.store.sql
          .prepare("SELECT * FROM instagram_sessions WHERE profileId=?")
          .get(profileId) as any;
        if (!row)
          throw new DatalomError("INVALID_INPUT", "请先提取此 Instagram 会话");
        if (row.leaseUntil > Date.now() || row.nextAt > Date.now())
          throw new DatalomError("CONFLICT", "Instagram 账号忙或冷却中");
        const lease = randomUUID();
        this.store.sql
          .prepare(
            "UPDATE instagram_sessions SET lease=?,leaseUntil=? WHERE profileId=?",
          )
          .run(lease, Date.now() + 60000, profileId);
        return {
          lease,
          version: row.version,
          session: this.store.vault.open<InstagramSession>(
            row.payload,
            `instagram:${profileId}`,
          ),
        };
      })
      .immediate();
  }
  renew(profileId: string, lease: string) {
    return (
      this.store.sql
        .prepare(
          "UPDATE instagram_sessions SET leaseUntil=? WHERE profileId=? AND lease=? AND leaseUntil>?",
        )
        .run(Date.now() + 60000, profileId, lease, Date.now()).changes === 1
    );
  }
  save(session: InstagramSession, version: number, lease: string) {
    if (
      this.store.sql
        .prepare(
          "UPDATE instagram_sessions SET payload=? WHERE profileId=? AND version=? AND lease=? AND leaseUntil>?",
        )
        .run(
          this.store.vault.seal(session, `instagram:${session.profileId}`),
          session.profileId,
          version,
          lease,
          Date.now(),
        ).changes !== 1
    )
      throw new DatalomError("CONFLICT", "Instagram 会话版本或租约变化");
  }
  release(profileId: string, lease: string, cooldown = 3000) {
    this.store.sql
      .prepare(
        "UPDATE instagram_sessions SET lease=NULL,leaseUntil=0,nextAt=MAX(nextAt,?) WHERE profileId=? AND lease=?",
      )
      .run(Date.now() + cooldown, profileId, lease);
  }
}
