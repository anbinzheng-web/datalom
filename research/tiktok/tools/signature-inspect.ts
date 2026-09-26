import { openStore } from "@datalom/storage-node/runtime";
import {
  decodeGnarly,
  decodeDynosaur,
} from "@datalom/platform-tiktok/signature-codec";
const s = openStore();
try {
  for (const a of s.listAccounts()) {
    const t = s.getSecret(a.id).research?.requestTemplates?.["video.comments"];
    if (!t) continue;
    const u = new URL(t.url);
    for (const [name, decode] of [
      ["X-Gnarly", decodeGnarly],
      ["X-Dynosaur", decodeDynosaur],
    ] as const) {
      try {
        const fields = decode(u.searchParams.get(name)!);
        console.log(JSON.stringify({ account: a.label, name, fields }));
      } catch (e) {
        console.log({ account: a.label, name, error: (e as Error).message });
      }
    }
  }
} finally {
  s.close();
}
