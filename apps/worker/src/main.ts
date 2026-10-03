import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { runIdle } from './idle.ts';

const store = await openStore();
const worker = await runIdle(store);
console.log('Datalom worker idle');
let stopping = false;
const fatal = (error: unknown) => {
  try {
    store.diagnostics.emergency({
      stage: 'worker-process-fatal',
      pid: process.pid,
      error: errorRecord(error),
    });
  } finally {
    process.exit(1);
  }
};
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await worker.stop(signal);
    await store.close();
    process.exit(0);
  });
