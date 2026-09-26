import { openStore } from "@datalom/storage-node/runtime";
const store = openStore();
try {
  const rows = store.sql
    .prepare(
      "SELECT id,requestId,stage FROM diagnostic_events WHERE stage IN ('doubao-http','doubao-page') ORDER BY seq DESC LIMIT 120",
    )
    .all() as any[];
  for (const row of rows) {
    const raw = store.diagnostics.rawEvent(row.id) as any;
    if (!raw.url) continue;
    const path = new URL(raw.url).pathname;
    if (path.includes("send_rate_limit"))
      console.log(
        JSON.stringify({
          evidenceId: row.id,
          path,
          requestBody: raw.requestBody,
          response: JSON.parse(raw.body),
        }),
      );
    else if (
      /completion|conversation\/|message\/|config\/pull/.test(path) &&
      raw.requestBody
    ) {
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
          contentType: raw.responseHeaders?.["content-type"],
          bodyBytes: raw.body?.length,
        }),
      );
    }
  }
  const session = store.getSetting<any>("doubao-research-session");
  console.log(
    JSON.stringify({
      localStorageKeys: session?.storageState?.origins?.map((origin: any) => ({
        origin: origin.origin,
        keys: origin.localStorage.map((entry: any) => entry.name),
      })),
    }),
  );
} finally {
  store.close();
}
