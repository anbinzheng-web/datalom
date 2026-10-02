import { randomUUID } from "node:crypto";
import { DatalomError, type SessionSecret } from "@datalom/shared/runtime/contracts";
import type { Store } from "@datalom/shared/storage/store";
export interface FacebookSession extends SessionSecret { profileId: string; capturedAt: number; requestCounter: number }
export class FacebookSessions {
  constructor(private store: Store) { store.sql.exec(`CREATE TABLE IF NOT EXISTS facebook_sessions(profileId TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, lease TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL DEFAULT 0)`); }
  replace(session: FacebookSession) {
    this.store.sql.transaction(()=>{
      const row=this.store.sql.prepare("SELECT * FROM facebook_sessions WHERE profileId=?").get(session.profileId) as any;
      if(row?.leaseUntil>Date.now())throw new DatalomError("CONFLICT","Facebook 会话正在使用");
      this.store.sql.prepare("INSERT INTO facebook_sessions(profileId,version,payload) VALUES(?,1,?) ON CONFLICT(profileId) DO UPDATE SET version=version+1,payload=excluded.payload,lease=NULL,leaseUntil=0").run(session.profileId,this.store.vault.seal(session,`facebook:${session.profileId}`));
    }).immediate();
  }
  acquire(profileId: string) {
    return this.store.sql.transaction(()=>{
      const row=this.store.sql.prepare("SELECT * FROM facebook_sessions WHERE profileId=?").get(profileId) as any;
      if(!row)throw new DatalomError("INVALID_INPUT","请先提取此 Facebook 会话");
      if(row.leaseUntil>Date.now()||row.nextAt>Date.now())throw new DatalomError("CONFLICT","Facebook 账号忙或冷却中");
      const lease=randomUUID();this.store.sql.prepare("UPDATE facebook_sessions SET lease=?,leaseUntil=? WHERE profileId=?").run(lease,Date.now()+60000,profileId);
      return {lease,version:row.version,session:this.store.vault.open<FacebookSession>(row.payload,`facebook:${profileId}`)};
    }).immediate();
  }
  renew(profileId:string,lease:string) {return this.store.sql.prepare("UPDATE facebook_sessions SET leaseUntil=? WHERE profileId=? AND lease=? AND leaseUntil>?").run(Date.now()+60000,profileId,lease,Date.now()).changes===1;}
  save(session:FacebookSession,version:number,lease:string) {if(this.store.sql.prepare("UPDATE facebook_sessions SET payload=? WHERE profileId=? AND version=? AND lease=? AND leaseUntil>?").run(this.store.vault.seal(session,`facebook:${session.profileId}`),session.profileId,version,lease,Date.now()).changes!==1)throw new DatalomError("CONFLICT","Facebook 会话版本或租约变化");}
  release(profileId:string,lease:string,cooldown=3000) {this.store.sql.prepare("UPDATE facebook_sessions SET lease=NULL,leaseUntil=0,nextAt=MAX(nextAt,?) WHERE profileId=? AND lease=?").run(Date.now()+cooldown,profileId,lease);}
}
