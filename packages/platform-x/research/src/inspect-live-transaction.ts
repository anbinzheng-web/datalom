import { artifactPath } from '@datalom/shared/runtime/paths';
import { chromium } from 'playwright';
import { parseHTML } from 'linkedom';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { profileConnection } from './connection.ts';
import { XTransaction } from '@datalom/platform-x/transaction';
const store = await openStore(),
  requestId = randomUUID();
let browser;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
try {
  const profileId = process.argv[2],
    reload = process.argv[3] === '--reload';
  let captureId = process.argv[3];
  let capture = reload ? undefined : ((await store.diagnostics.rawEvent(captureId)) as any);
  if (!reload && (capture.profileId !== profileId || !capture.url?.includes('/SearchTimeline')))
    throw Error('Need same-profile search evidence');
  const { endpoint } = await profileConnection(store, profileId);
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) =>
      reload ? p.url().startsWith('https://x.com/search?') : p.url() === capture.pageUrl,
    );
  if (!page) throw Error('Original captured page no longer open');
  let body: string;
  if (reload) {
    const [documentResponse, response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().isNavigationRequest() && r.request().frame() === page.mainFrame(),
        { timeout: 30000 },
      ),
      page.waitForResponse(
        (r) =>
          new URL(r.url()).origin === 'https://x.com' &&
          new URL(r.url()).pathname.endsWith('/SearchTimeline'),
        { timeout: 30000 },
      ),
      page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    ]);
    body = await documentResponse.text();
    const data = await response.body();
    capture = {
      profileId,
      name: 'SearchTimeline',
      pageUrl: page.url(),
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      bytes: data.length,
      body: data.toString('utf8'),
      requestHeaders: await response.request().allHeaders(),
      responseHeaders: await response.allHeaders(),
    };
    captureId = await store.diagnostics.event({ requestId }, 'x-http', 'received', capture);
  } else {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Page.enable');
      const { frameTree } = await cdp.send('Page.getFrameTree');
      const resource = await cdp.send('Page.getResourceContent', {
        frameId: frameTree.frame.id,
        url: page.url(),
      });
      body = resource.base64Encoded
        ? Buffer.from(resource.content, 'base64').toString('utf8')
        : resource.content;
    } finally {
      await cdp.detach();
    }
  }
  const doc = parseHTML(body).document;
  const meta = doc.querySelector('[name="twitter-site-verification"]');
  const svgs = [...doc.querySelectorAll('[id^="loading-x-anim"]')];
  if (!meta || svgs.length !== 4) throw Error('Original bootstrap inputs unavailable');
  const html = meta.outerHTML + svgs.map((x) => x.outerHTML).join('');
  const live = await page.evaluate(() => ({
    verification: document
      .querySelector('[name="twitter-site-verification"]')
      ?.getAttribute('content'),
    script: ((window as any).webpackChunk_twitter_responsive_web || [])
      .find((x: any) => x[1]?.[208932])?.[1][208932]
      .toString(),
  }));
  if (live.verification !== meta.getAttribute('content') || !live.script)
    throw Error('Bootstrap inputs differ from current DOM');
  const id = capture.requestHeaders['x-client-transaction-id'];
  const bytes = Buffer.from(id, 'base64');
  const data = Buffer.from(bytes.subarray(1).map((x) => x ^ bytes[0]));
  const key = Buffer.from(live.verification!, 'base64');
  if (data.length !== key.length + 21) throw Error('Unexpected transaction format');
  const time = data.readUInt32LE(key.length),
    mask = bytes[0],
    path = new URL(capture.url).pathname;
  const local = XTransaction.fromSources(html, live.script).generate(
    capture.method,
    path,
    time,
    mask,
  );
  const report = {
    requestId,
    captureId,
    status: capture.status,
    pageKeyMatchesRequest: data.subarray(0, key.length).equals(key),
    officialBrowserMatchesNode: id === local,
    sourceHash: hash(live.script),
    officialHash: hash(id),
    nodeHash: hash(local),
    time: time + 1682924400,
    bytes: data.length,
    scriptType: 'unmodified public webpack factory',
    networkUsed: reload,
  };
  const evidenceId = await store.diagnostics.event(
    { requestId },
    'x-live-transaction-parity',
    'recorded',
    { ...report, html, script: live.script, officialId: id, localId: local },
  );
  mkdirSync(artifactPath('x/source-analysis'), { recursive: true });
  writeFileSync(
    artifactPath(`x/source-analysis/live-parity-${captureId}.json`),
    JSON.stringify({ ...report, evidenceId }, null, 2),
  );
  console.log({ ...report, evidenceId });
} catch (error) {
  console.log({
    failed: true,
    evidenceId: await store.diagnostics.event(
      { requestId },
      'x-live-transaction-parity',
      'failed',
      { error: errorRecord(error) },
    ),
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await store.close();
}
