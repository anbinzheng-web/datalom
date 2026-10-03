import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { LocalJournal } from './local-journal.ts';

export class Metrics {
  private instanceId = randomUUID();
  private rows = new Map<
    string,
    { operation: string; code: string; calls: number; totalMs: number; maxMs: number }
  >();
  private journal: LocalJournal;
  private failure?: unknown;
  private timer: ReturnType<typeof setInterval>;
  constructor(dir: string) {
    this.journal = new LocalJournal(join(dir, 'metrics'));
    this.timer = setInterval(() => {
      void this.flush().catch((error) => {
        this.failure = error;
        process.stderr.write('DATALOM_METRICS_WRITE_FAILED\n');
      });
    }, 10000);
    this.timer.unref();
  }
  record(operation: string, code: string, durationMs: number) {
    let key = JSON.stringify([operation, code]);
    if (!this.rows.has(key) && this.rows.size >= 1000) {
      operation = 'other';
      code = 'other';
      key = 'other';
    }
    const row = this.rows.get(key) ?? { operation, code, calls: 0, totalMs: 0, maxMs: 0 };
    row.calls++;
    row.totalMs += Math.max(0, durationMs);
    row.maxMs = Math.max(row.maxMs, durationMs);
    this.rows.set(key, row);
  }
  snapshot() {
    return {
      processId: process.pid,
      instanceId: this.instanceId,
      persistenceHealthy: !this.failure,
      rows: [...this.rows.values()].map((row) => ({
        ...row,
        averageMs: Math.round(row.totalMs / row.calls),
      })),
    };
  }
  async flush() {
    await this.journal.append({ createdAt: Date.now(), ...this.snapshot() });
    this.failure = undefined;
  }
  async close() {
    clearInterval(this.timer);
    try {
      await this.flush();
    } finally {
      await this.journal.close();
    }
  }
}
