import { readFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import {
  buildRequest,
  validateResult,
  operations,
  type Capture,
  type XOperation,
} from '@datalom/platform-x/native';
const s = await openStore();
for (const path of process.argv.slice(2))
  for (const e of JSON.parse(readFileSync(path, 'utf8')).entries) {
    const op = Object.entries(operations).find(([, n]) => n === e.name)?.[0] as XOperation;
    if (!op) continue;
    try {
      const c = (await s.diagnostics.rawEvent(e.evidenceId)) as Capture;
      const r = buildRequest(op, c, {});
      const v = validateResult(op, r.variables, c.status, c.body);
      console.log({
        op,
        id: e.evidenceId,
        count: v.raw.items.length,
        hasMore: v.page?.hasMore,
      });
    } catch (e) {
      console.log({ op, error: e instanceof Error ? e.message : 'error' });
    }
  }
await s.close();
