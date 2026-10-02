import { randomUUID } from "node:crypto";
import { DatalomError, type SessionSecret } from "@datalom/shared/runtime/contracts";
import type { Store } from "@datalom/shared/storage/store";
export interface XSession extends SessionSecret {
  profileId: string;
  partitionCookieJar?: string;
  capturedAt: number;
  requestCounter: number;
}
export class XSessions {
  constructor(private store: Store) {
    store.sql.exec(
      `CREATE TABLE IF NOT EXISTS x_sessions(profileId TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, lease TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL DEFAULT 0)`,
    );
  }
  replace(session: XSession) {
    this.store.sql
      .transaction(() => {
        const row = this.store.sql
          .prepare("SELECT * FROM x_sessions WHERE profileId=?")
          .get(session.profileId) as any;
        if (row?.leaseUntil > Date.now())
          throw new DatalomError("CONFLICT", "X 会话正在使用");
        this.store.sql
          .prepare(
            "INSERT INTO x_sessions(profileId,version,payload) VALUES(?,1,?) ON CONFLICT(profileId) DO UPDATE SET version=version+1,payload=excluded.payload,lease=NULL,leaseUntil=0",
          )
          .run(
            session.profileId,
            this.store.vault.seal(session, `x:${session.profileId}`),
          );
      })
      .immediate();
  }
  acquire(profileId: string) {
    return this.store.sql
      .transaction(() => {
        const row = this.store.sql
          .prepare("SELECT * FROM x_sessions WHERE profileId=?")
          .get(profileId) as any;
        if (!row) throw new DatalomError("INVALID_INPUT", "请先提取此 X 会话");
        if (row.leaseUntil > Date.now() || row.nextAt > Date.now())
          throw new DatalomError("CONFLICT", "X 账号忙或冷却中");
        const lease = randomUUID();
        this.store.sql
          .prepare(
            "UPDATE x_sessions SET lease=?,leaseUntil=? WHERE profileId=?",
          )
          .run(lease, Date.now() + 60000, profileId);
        return {
          lease,
          version: row.version,
          session: this.store.vault.open<XSession>(
            row.payload,
            `x:${profileId}`,
          ),
        };
      })
      .immediate();
  }
  renew(profileId: string, lease: string) {
    return (
      this.store.sql
        .prepare(
          "UPDATE x_sessions SET leaseUntil=? WHERE profileId=? AND lease=? AND leaseUntil>?",
        )
        .run(Date.now() + 60000, profileId, lease, Date.now()).changes === 1
    );
  }
  save(session: XSession, version: number, lease: string) {
    if (
      this.store.sql
        .prepare(
          "UPDATE x_sessions SET payload=? WHERE profileId=? AND version=? AND lease=? AND leaseUntil>?",
        )
        .run(
          this.store.vault.seal(session, `x:${session.profileId}`),
          session.profileId,
          version,
          lease,
          Date.now(),
        ).changes !== 1
    )
      throw new DatalomError("CONFLICT", "X 会话版本或租约变化");
  }
  release(profileId: string, lease: string, cooldown = 3000) {
    this.store.sql
      .prepare(
        "UPDATE x_sessions SET lease=NULL,leaseUntil=0,nextAt=MAX(nextAt,?) WHERE profileId=? AND lease=?",
      )
      .run(Date.now() + cooldown, profileId, lease);
  }
}
