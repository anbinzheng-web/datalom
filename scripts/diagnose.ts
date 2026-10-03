import { LocalJournal } from '@datalom/shared/storage/local-journal';
import { openStore } from '@datalom/shared/storage/runtime';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const store = await openStore();
const [command, id] = process.argv.slice(2);
const folder = join(store.dir, 'diagnostics', 'exports');
function save(name: string, data: unknown) {
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, name);
  writeFileSync(path, JSON.stringify(data, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(path);
}
try {
  if (command === 'inspect' && id) {
    console.log(JSON.stringify(await store.diagnostics.bundle({ id }), null, 2));
  } else if (command === 'incident' && id) {
    save(`sensitive-incident-${Date.now()}.json`, await store.diagnostics.rawIncident(id));
  } else if (command === 'metrics') {
    const latest = new Map<string, unknown>();
    const journal = new LocalJournal(join(store.dir, 'metrics'));
    for await (const row of journal.records()) {
      latest.set(row.instanceId ?? String(row.processId), row);
      if (latest.size > 1000) latest.delete(latest.keys().next().value!);
    }
    await journal.close();
    console.log(JSON.stringify([...latest.values()], null, 2));
  } else if (command === 'raw' && id) {
    // Deliberate local-only export; never send raw secrets through a web API or stdout.
    save(`sensitive-event-${Date.now()}.json`, await store.diagnostics.rawEvent(id));
  } else if (command === 'emergency') {
    const rows = readFileSync(join(store.dir, 'diagnostics', 'emergency.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const r = JSON.parse(line);
        return {
          id: r.id,
          createdAt: r.createdAt,
          data: store.vault.open(r.payload, `emergency:${r.id}`),
        };
      });
    save(`sensitive-emergency-${Date.now()}.json`, rows);
  } else if (command === 'events') {
    console.log(JSON.stringify(await store.diagnostics.events(), null, 2));
  } else {
    console.log(
      'Usage: pnpm diagnose inspect <requestId> | events | raw <eventId> | emergency | incident <reference> | metrics\nraw/emergency 会将含敏感信息的证据解密到本机 .datalom/diagnostics/exports，仅在本机排查，不要上传共享。',
    );
    process.exitCode = 1;
  }
} finally {
  await store.close();
}
