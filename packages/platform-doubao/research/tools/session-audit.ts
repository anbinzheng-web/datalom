import { artifactPath } from '@datalom/shared/runtime/paths';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
const store = await openStore();
const runId = process.argv[2] ?? '63d8de78-6dd0-4f72-86b1-0189ff9edf12';
const hash = (value: unknown) =>
  value === undefined
    ? null
    : createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
try {
  const rows = (await store.diagnostics.find(row => row.requestId === runId, 10000, false)) as any[];
  const events = [];
  for (const row of rows) {
    const raw = (await store.diagnostics.rawEvent(row.id)) as any;
    if (!raw.url || !raw.body || row.stage !== 'doubao-http') continue;
    const url = new URL(raw.url);
    let data: any;
    try {
      data = JSON.parse(raw.body);
    } catch {
      data = {};
    }
    const cookies = Object.fromEntries(
      String(raw.headers?.cookie ?? '')
        .split(/;\s*/)
        .filter(Boolean)
        .map((pair) => {
          const index = pair.indexOf('=');
          return [pair.slice(0, index), hash(pair.slice(index + 1))];
        }),
    );
    const event = {
      evidenceId: row.id,
      at: row.createdAt,
      method: raw.method,
      path: url.pathname,
      status: raw.status,
      result: {
        code: data.code ?? data.status_code,
        message: data.msg ?? data.message ?? data.status_desc,
        keys: Object.keys(data),
        uidHash: hash(data.uid),
        webIdHash: hash(data.web_id),
      },
      queryIdentities: Object.fromEntries(
        ['device_id', 'web_id', 'tea_uuid', 'fp', 'web_tab_id']
          .filter((key) => url.searchParams.has(key))
          .map((key) => [key, hash(url.searchParams.get(key))]),
      ),
      cookies,
      setCookieNames: [
        ...String(raw.responseHeaders?.['set-cookie'] ?? '').matchAll(
          /(?:^|[\n,]\s*)([a-zA-Z0-9_-]+)=/g,
        ),
      ].map((m) => m[1]),
    };
    events.push(event);
  }
  mkdirSync(artifactPath(), { recursive: true });
  writeFileSync(
    artifactPath('doubao-session-audit.json'),
    JSON.stringify({ runId, events }, null, 2),
  );
  console.log(
    JSON.stringify({
      runId,
      path: artifactPath('doubao-session-audit.json'),
      events: events
        .filter((e) => /passport|completion|get_web_anon_id/.test(e.path))
        .map((e) => ({ ...e, cookies: Object.keys(e.cookies) })),
    }),
  );
} finally {
  await store.close();
}
