import { artifactPath } from '@datalom/shared/runtime/paths';
// Offline research only. Runs reviewed public JS in an isolated, network-blocked browser.
import { chromium } from 'playwright';
import { parseHTML } from 'linkedom';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { XTransaction } from '@datalom/platform-x/transaction';
const store = await openStore(),
  requestId = randomUUID();
let browser;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
try {
  const events = (await store.diagnostics.find(row => row.stage === 'x-transaction-source' && row.outcome === 'received', 10000, false)) as any[];
  const runs = new Map<string, any>();
  for (const row of events) {
    const p = (await store.diagnostics.rawEvent(row.id)) as any;
    const run = runs.get(row.requestId) ?? {};
    if (p.url === 'https://x.com/home') run.html = { id: row.id, body: p.body };
    if (p.url?.includes('/ondemand.s.')) run.script = { id: row.id, body: p.body, url: p.url };
    runs.set(row.requestId, run);
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const reports = [];
  for (const [sourceRequestId, run] of runs) {
    if (!run.html || !run.script) continue;
    const scriptHash = hash(run.script.body);
    if (
      ![
        '1b0ac38199e80c9d4a3042a0cc767e4d5077007204ce87da2e678aa5d716163e',
        'e42ed663d830f484217952bc5ea15e5cf9575f4cd19d983e94fca027ab150e41',
      ].includes(scriptHash)
    )
      continue;
    const dom = parseHTML(run.html.body).document;
    const meta = dom.querySelector('[name="twitter-site-verification"]')!;
    const svgs = [...dom.querySelectorAll('[id^="loading-x-anim"]')];
    // Keep only the exact public inputs; no website application, cookies or account data.
    const html =
      '<!doctype html><html><head>' +
      meta.outerHTML +
      '</head><body>' +
      svgs.map((x) => x.outerHTML).join('') +
      '</body></html>';
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (route) =>
      route.request().url() === 'https://offline.invalid/'
        ? route.fulfill({ contentType: 'text/html', body: html })
        : route.abort(),
    );
    const page = await context.newPage();
    await page.goto('https://offline.invalid/');
    // tsx preserves function names in the research callback via this helper.
    await page.addScriptTag({ content: 'globalThis.__name = (fn) => fn;' });
    await page.addScriptTag({ content: run.script.body });
    const path = '/i/api/graphql/KPSo2_UWdOMpPJwjhfT1Qg/SearchTimeline',
      time = 100000123,
      mask = 77;
    const original = await page.evaluate(
      async ({ path, time, mask }) => {
        const w = window as any;
        const chunk = w.webpackChunk_twitter_responsive_web.find((x: any) => x[0].includes(59924));
        const module: any = {};
        const req: any = () => {};
        req.d = (o: any, p: any) => {
          for (const [k, v] of Object.entries(p)) Object.defineProperty(o, k, { get: v as any });
        };
        chunk[1][208932]({}, module, req);
        Date.now = () => (time + 1682924400) * 1000;
        Math.random = () => mask / 256;
        const digest = crypto.subtle.digest.bind(crypto.subtle),
          inputs: string[] = [];
        crypto.subtle.digest = ((algorithm: any, data: any) => {
          inputs.push(new TextDecoder().decode(data));
          return digest(algorithm, data);
        }) as any;
        const fn = module.default();
        const id = await fn(path, 'GET');
        // Re-run after microtasks: any RTC offer completion must not alter the hash.
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { id, secondId: await fn(path, 'GET'), inputs };
      },
      { path, time, mask },
    );
    const local = XTransaction.fromSources(run.html.body, run.script.body).generate(
      'GET',
      path,
      time,
      mask,
    );
    const report = {
      sourceRequestId,
      htmlEvidenceId: run.html.id,
      scriptEvidenceId: run.script.id,
      scriptHash,
      officialMatchesLocal: original.id === local,
      stableAfterRTC: original.id === original.secondId,
      officialHash: hash(original.id),
      localHash: hash(local),
    };
    const evidenceId = await store.diagnostics.event(
      { requestId },
      'x-official-parity',
      'recorded',
      {
        ...report,
        original,
        local,
        network: 'blocked',
        browserVersion: browser.version(),
      },
    );
    reports.push({ ...report, evidenceId });
    await context.close();
  }
  const report = {
    requestId,
    browserVersion: browser.version(),
    network: 'blocked',
    livePlatformVerified: false,
    fixtures: reports.length,
    matched: reports.filter((x) => x.officialMatchesLocal).length,
    results: reports,
  };
  mkdirSync(artifactPath('x/source-analysis'), { recursive: true });
  writeFileSync(
    artifactPath('x/source-analysis/official-parity.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} catch (error) {
  console.log({
    failed: true,
    evidenceId: await store.diagnostics.event({ requestId }, 'x-official-parity', 'failed', {
      error: errorRecord(error),
    }),
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await store.close();
}
