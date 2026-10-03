import { PlatformSessions } from '@datalom/shared/storage/sessions';
import { artifactPath } from '@datalom/shared/runtime/paths';
import { dataDirectory } from '@datalom/shared/runtime/paths';
import { resolve as resolveDataPath } from 'node:path';
import { chromium, type Response, type Browser } from 'playwright';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { openStore } from '@datalom/shared/storage/runtime';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { inspectDoubaoStream, parseDoubaoLimit } from '@datalom/platform-doubao/protocol';
import {
  assertDoubaoAnonymousCookies,
  inspectDoubaoAnonymousCookies,
} from '@datalom/platform-doubao/anonymous';

const store = await openStore();
const command = process.argv[2] ?? 'inspect';
const runId = randomUUID();
const manual = command === 'manual';
const headedCdp = manual || process.argv.includes('--headed-cdp');
const record = async (stage: string, outcome: string, payload: unknown) =>
  await store.diagnostics.event({ requestId: runId }, `doubao-${stage}`, outcome, payload);
let browser: Browser | undefined;
let launchedBrowser: Browser | undefined;
const pending = new Set<Promise<void>>();
const responses: any[] = [];
try {
  let cdpPort: number | undefined;
  if (headedCdp) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local CDP port');
    cdpPort = address.port;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await record('browser', 'starting', {
    headless: !headedCdp,
    direct: true,
    cdpPort,
  });
  // Manual mode keeps its window visible for the user's own test.
  launchedBrowser = await chromium.launch({
    channel: 'chrome',
    headless: !headedCdp,
    args: [
      '--no-proxy-server',
      '--disable-quic',
      ...(headedCdp
        ? [
            `--remote-debugging-port=${cdpPort}`,
            '--remote-debugging-address=127.0.0.1',
            ...(manual ? [] : ['--start-minimized']),
          ]
        : []),
    ],
  });
  browser = headedCdp
    ? await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    : launchedBrowser;
  await record('browser', 'connected', {
    transport: headedCdp ? 'cdp-localhost' : 'playwright',
    version: browser.version(),
    headless: !headedCdp,
  });
  const saved = await new PlatformSessions<any>(store.sql, store.vault, 'doubao', 'research').read(
    'default',
  );
  const savedAnonymous = saved
    ? inspectDoubaoAnonymousCookies(saved.storageState?.cookies ?? [])
    : undefined;
  if (savedAnonymous && !savedAnonymous.anonymous)
    await record('anonymous-session', 'saved-account-state-rejected', {
      accountCookies: savedAnonymous.accountCookies,
    });
  const reusableSession = savedAnonymous?.anonymous ? saved : undefined;
  const context = await browser.newContext({
    storageState: reusableSession?.storageState,
    viewport: { width: 1440, height: 1000 },
  });
  if (reusableSession?.sessionStorage) {
    await context.addInitScript((byOrigin: Record<string, Record<string, string>>) => {
      const values = byOrigin[location.origin];
      if (values)
        for (const [key, value] of Object.entries(values)) {
          if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value);
        }
    }, reusableSession.sessionStorage);
  }
  const page = await context.newPage();
  if (headedCdp && !manual) {
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    });
    let { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
    const minimizeDeadline = Date.now() + 3000;
    while (bounds.windowState !== 'minimized' && Date.now() < minimizeDeadline) {
      await page.waitForTimeout(100);
      ({ bounds } = await cdp.send('Browser.getWindowBounds', { windowId }));
    }
    await record('browser-window', 'observed', { windowState: bounds.windowState });
    if (bounds.windowState !== 'minimized') throw new Error('Research window did not minimize');
    await cdp.detach();
  }
  const readyPaths = new Set<string>();
  let chatResult: Awaited<ReturnType<typeof inspectDoubaoStream>> | undefined;
  let limitResult: Awaited<ReturnType<typeof parseDoubaoLimit>> | undefined;
  const snapshot = async (phase: string) => {
    const storageState = await context.storageState({ indexedDB: true });
    const storage = await page.evaluate(() => ({
      origin: location.origin,
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
      runtime: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        webdriver: navigator.webdriver,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookieEnabled: navigator.cookieEnabled,
        secureContext: isSecureContext,
      },
    }));
    await record('storage', 'snapshot', { phase, storageState, ...storage });
    return {
      storageState,
      sessionStorage: { [storage.origin]: storage.sessionStorage },
      savedAt: Date.now(),
      userAgent: storage.runtime.userAgent,
    };
  };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'doubao.com' || url.hostname.endsWith('.doubao.com')) {
      const p = request
        .allHeaders()
        .then(async (headers) => {
          await record('request', 'started', {
            url: request.url(),
            method: request.method(),
            headers,
            body: request.postData(),
            resourceType: request.resourceType(),
            timing: request.timing(),
          });
        })
        .catch(async (error) => {
          await record('request', 'capture-failed', {
            url: request.url(),
            method: request.method(),
            error: errorRecord(error),
          });
        });
      pending.add(p);
      void p.then(
        () => pending.delete(p),
        () => pending.delete(p),
      );
    }
  });
  const capture = async (response: Response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (
      !['xhr', 'fetch', 'document'].includes(request.resourceType()) ||
      !(url.hostname === 'doubao.com' || url.hostname.endsWith('.doubao.com'))
    )
      return;
    const summary: any = {
      method: request.method(),
      path: url.pathname,
      status: response.status(),
      queryKeys: [...url.searchParams.keys()],
    };
    responses.push(summary);
    const headers = await response.allHeaders();
    await record('response-headers', 'received', {
      url: response.url(),
      headers,
      headerEntries: await response.headersArray(),
      status: response.status(),
    });
    try {
      const body = await response.text();
      summary.bytes = Buffer.byteLength(body);
      summary.evidenceId = await record('http', 'received', {
        url: response.url(),
        method: request.method(),
        headers: await request.allHeaders(),
        requestBody: request.postData(),
        responseHeaders: headers,
        status: response.status(),
        body,
        timing: request.timing(),
      });
      if (url.pathname === '/im/message/send_rate_limit') {
        limitResult = parseDoubaoLimit(response.status(), body);
        await record('precheck', limitResult.limited ? 'limited' : 'not-limited', limitResult);
      }
      if (body.startsWith('{')) {
        try {
          const json = JSON.parse(body);
          summary.responseKeys = Object.keys(json);
          if ((json.code ?? json.status_code) === 0) readyPaths.add(url.pathname);
        } catch {}
      }
      if (url.pathname === '/chat/completion') {
        chatResult = inspectDoubaoStream(response.status(), body);
        await record('business', 'classified', {
          responseEvidenceId: summary.evidenceId,
          result: chatResult,
        });
      }
      if (/completion|message\/send_rate_limit|user\/get_web_anon_id/.test(url.pathname))
        console.log(JSON.stringify({ response: summary }));
    } catch (error) {
      summary.captureFailed = true;
      await record('http', 'capture-failed', {
        url: response.url(),
        error: errorRecord(error),
      });
    }
  };
  page.on('response', (response) => {
    const p = capture(response).catch(async (error) => {
      await record('capture', 'failed', { error: errorRecord(error) });
    });
    pending.add(p);
    void p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
  });
  page.on(
    'requestfailed',
    async (request) =>
      await record('request', 'failed', {
        url: request.url(),
        method: request.method(),
        failure: request.failure(),
      }),
  );
  page.on('pageerror', async (error) => await record('page', 'error', errorRecord(error)));
  await record('experiment', 'started', {
    command,
    browserVersion: browser.version(),
    headless: !headedCdp,
    connection: headedCdp ? 'cdp-localhost' : 'playwright',
    direct: true,
    reusedSession: !!reusableSession,
    rejectedSavedAccountState: !!saved && !reusableSession,
    rate: 'single-message-manual-experiment',
  });
  await page.goto('https://www.doubao.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(8000);
  const anonymous = assertDoubaoAnonymousCookies(await context.cookies('https://www.doubao.com/'));
  await record('anonymous-session', 'verified', {
    cookieNames: anonymous.cookieNames,
    accountCookies: anonymous.accountCookies,
  });
  if (command === 'chat') {
    const required = [
      '/alice/user/get_web_anon_id',
      '/alice/basic/launch',
      '/im/message/send_rate_limit',
    ];
    const deadline = Date.now() + 20000;
    while (required.some((path) => !readyPaths.has(path)) && Date.now() < deadline)
      await page.waitForTimeout(250);
    const missing = required.filter((path) => !readyPaths.has(path));
    await record('initialization', missing.length ? 'incomplete' : 'ready', {
      required,
      completed: [...readyPaths],
      missing,
    });
    if (missing.length) throw new Error('Required page initialization requests have not completed');
    if (!limitResult || limitResult.limited)
      throw new Error('Message not sent: precheck unavailable or currently limited');
    await snapshot('before-message');
    const prompt = process.argv[3] ?? '只回复：DATALOM测试成功';
    await record('message', 'submitting', { prompt, messageCount: 1 });
    const composer = page.locator('[contenteditable="true"]:visible');
    if ((await composer.count()) !== 1)
      throw new Error('Expected one visible Doubao message composer');
    await composer.fill(prompt);
    await composer.press('Enter');
    const responseDeadline = Date.now() + 25000;
    while (!chatResult && Date.now() < responseDeadline) await page.waitForTimeout(250);
    if (!chatResult)
      throw new Error('No complete chat response captured within the experiment deadline');
    await record(
      'experiment-result',
      chatResult.success
        ? 'succeeded'
        : chatResult.classification === 'unverified_response'
          ? 'unverified'
          : 'rejected',
      chatResult,
    );
    console.log(JSON.stringify({ runId, chatResult }));
    await page.waitForTimeout(2000);
  } else if (command !== 'inspect' && !manual) throw new Error('Use inspect, chat or manual');
  const dom = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText.slice(0, 16000),
    inputs: [...document.querySelectorAll('input,textarea,[contenteditable=true]')].map((e) => ({
      tag: e.tagName,
      placeholder: e.getAttribute('placeholder'),
      role: e.getAttribute('role'),
      testId: e.getAttribute('data-testid'),
      ariaLabel: e.getAttribute('aria-label'),
      className: e.className,
    })),
    buttons: [...document.querySelectorAll('button')].map((e) => ({
      text: e.innerText,
      ariaLabel: e.getAttribute('aria-label'),
      testId: e.getAttribute('data-testid'),
      disabled: e.disabled,
    })),
    scripts: [...document.scripts].map((s) => s.src).filter(Boolean),
    resources: performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      initiator: (entry as PerformanceResourceTiming).initiatorType,
    })),
  }));
  const html = await page.content();
  await record('page', 'snapshot', {
    url: page.url(),
    html,
    dom,
    sha256: createHash('sha256').update(html).digest('hex'),
  });
  const fullSession = await snapshot('after-page');
  const { storageState } = fullSession;
  await new PlatformSessions<any>(store.sql, store.vault, 'doubao', 'research').replace(
    'default',
    fullSession,
  );
  console.log(
    JSON.stringify({
      runId,
      url: page.url(),
      title: dom.title,
      text: dom.text.slice(0, 4000),
      inputs: dom.inputs,
      buttons: dom.buttons,
      cookies: storageState.cookies.map((c) => ({
        name: c.name,
        domain: c.domain,
      })),
      scripts: dom.scripts.map((value) => {
        const u = new URL(value);
        return u.origin + u.pathname;
      }),
    }),
  );
  mkdirSync(artifactPath(), { recursive: true });
  if (headedCdp) {
    await record('screenshot', 'skipped', {
      reason: 'Minimized Chrome may suspend screenshot rendering; HTML and DOM retained',
    });
  } else {
    await page.screenshot({
      path: artifactPath('doubao-inspect.png'),
      fullPage: true,
    });
  }
  writeFileSync(
    artifactPath('doubao-inspect.json'),
    JSON.stringify({ runId, date: new Date().toISOString(), url: page.url(), responses }, null, 2),
  );
  if (manual) {
    await page.bringToFront();
    const ready = {
      runId,
      status: 'ready-for-manual-test',
      url: page.url(),
      cdpEndpoint: `http://127.0.0.1:${cdpPort}`,
    };
    await record('manual', 'ready', ready);
    writeFileSync(
      resolveDataPath(dataDirectory(), 'doubao-manual.json'),
      JSON.stringify(ready, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(ready));
    await new Promise<void>((resolve) => {
      page.once('close', () => resolve());
      browser!.once('disconnected', () => resolve());
    });
  }
} catch (error) {
  const evidenceId = await record('experiment', 'failed', {
    error: errorRecord(error),
  });
  console.log(
    JSON.stringify({
      runId,
      status: 'failed',
      evidenceId,
      errorType: error instanceof Error ? error.name : 'unknown',
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (launchedBrowser !== browser) await launchedBrowser?.close();
  await Promise.allSettled(pending);
  await record('experiment', 'closed', { responses: responses.length });
  await store.close();
}
