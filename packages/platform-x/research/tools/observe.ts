import { artifactPath } from '@datalom/shared/runtime/paths';
import { operations } from '@datalom/platform-x/native';
import { chromium, type Request, type Page } from 'playwright';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { profileConnection } from '../src/connection.ts';
const store = await openStore(),
  profileId = process.argv[2],
  runId = randomUUID();
let action = 'public-profile',
  stopped = false;
const entries: any[] = [],
  pending = new Set<Promise<void>>();
const contexts = new WeakMap<Request, any>();
const record = async (stage: string, outcome: string, data: unknown) =>
  await store.diagnostics.event({ requestId: runId }, `x-${stage}`, outcome, {
    profileId,
    ...(data as object),
  });
const flush = () => {
  mkdirSync(artifactPath('x'), { recursive: true });
  writeFileSync(
    artifactPath(`x/capture-${runId}.json`),
    JSON.stringify(
      {
        runId,
        profileId,
        updatedAt: new Date().toISOString(),
        independentVerified: false,
        entries,
      },
      null,
      2,
    ),
  );
};
const task = (p: Promise<void>) => {
  const safe = p.catch(async (e) => {
    await record('capture', 'failed', { error: errorRecord(e) });
  });
  pending.add(safe);
  void safe.then(() => pending.delete(safe));
};
function select(request: Request) {
  const u = new URL(request.url());
  if (u.origin !== 'https://x.com') return;
  const match = /^\/i\/api\/graphql\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_]+)$/.exec(u.pathname);
  if (!['GET', 'POST'].includes(request.method()) || !match) return;
  const name = match[2];
  console.log(JSON.stringify({ discoveredOperation: name, method: request.method() }));
  if (!Object.values(operations).includes(name as any)) return;
  return {
    name,
    docId: match[1],
    variables:
      u.searchParams.get('variables') ??
      JSON.stringify(JSON.parse(request.postData() ?? '{}').variables ?? {}),
    formKeys: [...u.searchParams.keys()],
  };
}
function attach(page: Page) {
  const pageId = randomUUID();
  page.on('request', async (request) => {
    if (!page.url().startsWith('https://x.com/') || page.url().includes('/direct/')) return;
    let selected;
    try {
      selected = select(request);
    } catch (error) {
      await record('selection', 'failed', { error: errorRecord(error) });
      return;
    }
    if (!selected) return;
    const meta = {
      ...selected,
      pageId,
      pageUrl: page.url(),
      action,
      captureId: randomUUID(),
    };
    contexts.set(request, meta);
    task(
      (async () => {
        await record('request', 'started', {
          ...meta,
          url: request.url(),
          method: request.method(),
          headers: await request.allHeaders(),
          body: request.postData(),
        });
      })(),
    );
  });
  page.on('response', async (response) => {
    const request = response.request(),
      meta = contexts.get(request);
    if (!meta) return;
    task(
      (async () => {
        const headersId = await record('headers', 'received', {
          ...meta,
          status: response.status(),
          headers: await response.allHeaders(),
        });
        try {
          const bytes = await response.body();
          const omitted = bytes.length > 12 * 1024 * 1024;
          const evidenceId = await record('http', omitted ? 'body-too-large' : 'received', {
            ...meta,
            url: response.url(),
            method: request.method(),
            requestBody: request.postData(),
            requestHeaders: await request.allHeaders(),
            responseHeaders: await response.allHeaders(),
            status: response.status(),
            body: omitted ? undefined : bytes.toString('utf8'),
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            headersId,
          });
          let variableKeys: string[] = [];
          try {
            variableKeys = Object.keys(JSON.parse(meta.variables ?? '{}'));
          } catch {}
          const item = {
            name: meta.name,
            docId: meta.docId,
            action: meta.action,
            status: response.status(),
            bytes: bytes.length,
            evidenceId,
            variableKeys,
            bodyOmitted: omitted,
          };
          entries.push(item);
          flush();
          console.log(JSON.stringify(item));
        } catch (error) {
          await record('http', 'capture-failed', {
            ...meta,
            headersId,
            error: errorRecord(error),
          });
        }
      })(),
    );
  });
  page.on('requestfailed', async (request) => {
    const meta = contexts.get(request);
    if (meta) await record('request', 'failed', { ...meta, failure: request.failure() });
  });
  page.on(
    'pageerror',
    async (error) =>
      await record('page', 'error', {
        pageId,
        action,
        pageUrl: page.url(),
        error: errorRecord(error),
      }),
  );
}
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let finish: (() => void) | undefined;
const stop = () => {
  stopped = true;
  finish?.();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const { endpoint } = await profileConnection(store, profileId);
  browser = await chromium.connectOverCDP(endpoint);
  browser.once('disconnected', stop);
  for (const ctx of browser.contexts()) {
    ctx
      .pages()
      .filter((p) => new URL(p.url()).hostname === 'x.com')
      .forEach(attach);
  }
  await record('observer', 'started', { runId, browserVersion: browser.version() });
  console.log(JSON.stringify({ ready: true, runId, pid: process.pid }));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    const label = String(chunk).trim();
    if (label === 'stop') stop();
    else if (/^[a-z0-9._-]{1,80}$/.test(label)) {
      action = label;
      await record('action', 'labelled', { action });
    }
  });
  if (!stopped)
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
} catch (error) {
  await record('observer', 'failed', { error: errorRecord(error) });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.allSettled([...pending]);
  flush();
  await record('observer', 'closed', { captures: entries.length });
  await store.close();
  process.stdin.pause();
}
