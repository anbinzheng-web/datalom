import { openStore } from '@datalom/shared/storage/runtime';
import { decodeGnarly, decodeDynosaur } from '@datalom/platform-tiktok/signature-codec';
const s = await openStore();
try {
  for (const a of await s.listAccounts()) {
    const t = (await s.getSecret(a.id)).research?.requestTemplates?.['video.comments'];
    if (!t) continue;
    const u = new URL(t.url);
    for (const [name, decode] of [
      ['X-Gnarly', decodeGnarly],
      ['X-Dynosaur', decodeDynosaur],
    ] as const) {
      try {
        const fields = decode(u.searchParams.get(name)!);
        console.log(JSON.stringify({ account: a.id, name, fields }));
      } catch (e) {
        console.log({ account: a.id, name, error: (e as Error).message });
      }
    }
  }
} finally {
  await s.close();
}
