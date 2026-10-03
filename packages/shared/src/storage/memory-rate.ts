import { DatalomError } from '../runtime/contracts.ts';
/** All reservations are synchronous: no await between reading and updating scopes. */
export class MemoryRate {
  private windows = new Map<string, { bucket: number; count: number; expires: number }>();
  private next = new Map<string, number>();
  private sweepAt = 0;
  constructor(private capacity = 100000) {}
  private sweep(now: number) {
    if (now < this.sweepAt) return;
    this.sweepAt = now + 60000;
    for (const [key, row] of this.windows) if (row.expires <= now) this.windows.delete(key);
    for (const [key, at] of this.next) if (at <= now) this.next.delete(key);
  }
  consume(scope: string, bucket: number, limit: number, now = Date.now()) {
    this.sweep(now);
    const old = this.windows.get(scope);
    if (!old && this.windows.size >= this.capacity) return false;
    const count = old?.bucket === bucket ? old.count : 0;
    if (count >= limit) return false;
    this.windows.set(scope, { bucket, count: count + 1, expires: now + 120000 });
    return true;
  }
  reserve(scopes: [string, number][], earliest: number, now = Date.now()) {
    this.sweep(now);
    const missing = new Set(scopes.map(([key]) => key).filter((key) => !this.next.has(key)));
    if (this.next.size + missing.size > this.capacity)
      throw new DatalomError('RATE_LIMIT', '限流状态容量已满');
    const at = Math.max(now, earliest, ...scopes.map(([key]) => this.next.get(key) ?? 0));
    for (const [key, spacing] of scopes) this.next.set(key, at + spacing);
    return at;
  }
}
