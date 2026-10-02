import { it, expect } from "vitest";
import { fixture, session } from "../../../../scripts/checks/helpers.ts";
import { Store } from "@datalom/shared/storage/store";
import { Vault } from "@datalom/shared/storage/crypto";
import { XSessions } from "../session.ts";
it("restores encrypted X sessions and rejects concurrent extraction, stale versions and expired leases", () => {
  const f = fixture();
  const id = "a".repeat(32);
  const value = {
    ...session(),
    profileId: id,
    capturedAt: 1,
    requestCounter: 0,
  };
  try {
    const s = new XSessions(f.store);
    s.replace(value);
    const h = s.acquire(id);
    expect(() => s.acquire(id)).toThrow();
    expect(() => s.replace(value)).toThrow();
    expect(() => s.save(value, h.version + 1, h.lease)).toThrow();
    h.session.requestCounter = 4;
    s.save(h.session, h.version, h.lease);
    const row = f.store.sql
      .prepare("SELECT payload FROM x_sessions WHERE profileId=?")
      .get(id) as any;
    expect(row.payload).not.toContain("secret-cookie-fixture");
    f.store.sql
      .prepare("UPDATE x_sessions SET leaseUntil=0 WHERE profileId=?")
      .run(id);
    expect(s.renew(id, h.lease)).toBe(false);
    expect(() => s.save(value, h.version, h.lease)).toThrow();
    const second = new Store(f.dir, new Vault(f.key));
    try {
      const other = new XSessions(second);
      const live = other.acquire(id);
      expect(live.session.requestCounter).toBe(4);
      s.release(id, h.lease, 0);
      expect(() => s.acquire(id)).toThrow();
      other.release(id, live.lease, 5000);
      expect(() => s.acquire(id)).toThrow();
    } finally {
      second.close();
    }
  } finally {
    f.cleanup();
  }
});
