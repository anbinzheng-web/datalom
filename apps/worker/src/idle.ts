import { randomUUID } from 'node:crypto';
import type { Store } from '@datalom/shared/storage/store';

// Idle process skeleton. It records process lifecycle and does not claim or run tasks.
export async function runIdle(store: Store) {
  const workerId = randomUUID();
  await store.diagnostics.event({}, 'worker', 'started', {
    workerId,
    pid: process.pid,
    node: process.version,
  });
  return {
    get healthy() {
      return true;
    },
    async stop(signal = 'stop') {
      await store.diagnostics.event({}, 'worker', 'stopped', { workerId, signal });
    },
  };
}
