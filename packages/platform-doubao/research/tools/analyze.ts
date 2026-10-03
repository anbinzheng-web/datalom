import { PlatformSessions } from '@datalom/shared/storage/sessions';
import { openStore } from '@datalom/shared/storage/runtime';
const store = await openStore();
try {
  const rows = (await store.diagnostics.find(row => ['doubao-http','doubao-page'].includes(row.stage), 120, true)) as any[];
  for (const row of rows) {
    const raw = (await store.diagnostics.rawEvent(row.id)) as any;
    if (!raw.url) continue;
    const path = new URL(raw.url).pathname;
    if (path.includes('send_rate_limit'))
      console.log(
        JSON.stringify({
          evidenceId: row.id,
          path,
          requestBody: raw.requestBody,
          response: JSON.parse(raw.body),
        }),
      );
    else if (/completion|conversation\/|message\/|config\/pull/.test(path) && raw.requestBody) {
      let request: any;
      try {
        request = JSON.parse(raw.requestBody);
      } catch {
        request = {};
      }
      console.log(
        JSON.stringify({
          evidenceId: row.id,
          path,
          requestKeys: Object.keys(request),
          contentType: raw.responseHeaders?.['content-type'],
          bodyBytes: raw.body?.length,
        }),
      );
    }
  }
  const session = await new PlatformSessions<any>(
    store.sql,
    store.vault,
    'doubao',
    'research',
  ).read('default');
  console.log(
    JSON.stringify({
      localStorageKeys: session?.storageState?.origins?.map((origin: any) => ({
        origin: origin.origin,
        keys: origin.localStorage.map((entry: any) => entry.name),
      })),
    }),
  );
} finally {
  await store.close();
}
