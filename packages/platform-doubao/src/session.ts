import { randomUUID } from "node:crypto";
import { CookieJar } from "tough-cookie";
import { DatalomError } from "@datalom/runtime-node/contracts";
import type { Store } from "@datalom/storage-node/store";
import { assertDoubaoAnonymousCookies } from "./anonymous.ts";

export interface DoubaoConversation {
  id: string;
  sectionId: string;
  lastMessageIndex: number;
}
export interface DoubaoSession {
  id: string;
  createdAt: number;
  provenance: "captured-guest" | "node-bootstrap";
  seedEvidenceId?: string;
  userAgent: string;
  params: Record<string, string>;
  cookieJar: NonNullable<ReturnType<CookieJar["serializeSync"]>>;
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
      .getCookiesSync("https://www.doubao.com/chat/completion")
      .map((c) => ({ name: c.key, value: c.value })),
  );
}

export class DoubaoSessions {
  constructor(private store: Store) {
    store.sql.exec(`CREATE TABLE IF NOT EXISTS doubao_sessions(
      id TEXT PRIMARY KEY,payload TEXT NOT NULL,lease TEXT,leaseUntil INTEGER NOT NULL DEFAULT 0)`);
  }
  create(session: DoubaoSession) {
    assertGuestJar(CookieJar.deserializeSync(session.cookieJar));
    if (this.exists(session.id))
      throw new DatalomError("CONFLICT", "豆包会话已存在；不会重置身份");
    this.store.sql
      .prepare("INSERT INTO doubao_sessions(id,payload) VALUES(?,?)")
      .run(session.id, this.store.vault.seal(session, `doubao:${session.id}`));
  }
  exists(id: string) {
    return !!this.store.sql
      .prepare("SELECT id FROM doubao_sessions WHERE id=?")
      .get(id);
  }
  acquire(id: string) {
    return this.store.sql
      .transaction(() => {
        const row = this.store.sql
          .prepare("SELECT * FROM doubao_sessions WHERE id=?")
          .get(id) as any;
        if (!row)
          throw new DatalomError(
            "INVALID_INPUT",
            "豆包会话不存在，请先 init 或 import-session",
          );
        if (row.leaseUntil > Date.now())
          throw new DatalomError("CONFLICT", "豆包会话正在执行请求");
        const lease = randomUUID();
        this.store.sql
          .prepare("UPDATE doubao_sessions SET lease=?,leaseUntil=? WHERE id=?")
          .run(lease, Date.now() + 300000, id);
        return {
          lease,
          session: this.store.vault.open<DoubaoSession>(
            row.payload,
            `doubao:${id}`,
          ),
        };
      })
      .immediate();
  }
  save(session: DoubaoSession, lease: string) {
    if (
      this.store.sql
        .prepare(
          "UPDATE doubao_sessions SET payload=? WHERE id=? AND lease=? AND leaseUntil>?",
        )
        .run(
          this.store.vault.seal(session, `doubao:${session.id}`),
          session.id,
          lease,
          Date.now(),
        ).changes !== 1
    )
      throw new DatalomError("CONFLICT", "豆包会话租约失效");
  }
  release(id: string, lease: string) {
    this.store.sql
      .prepare(
        "UPDATE doubao_sessions SET lease=NULL,leaseUntil=0 WHERE id=? AND lease=?",
      )
      .run(id, lease);
  }
}
