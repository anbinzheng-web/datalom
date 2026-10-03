import { createHash, randomUUID } from 'node:crypto';
import { chromium, type Response } from 'playwright';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { openStore } from '@datalom/shared/storage/runtime';
import { assertDoubaoAnonymousCookies } from '@datalom/platform-doubao/anonymous';
import { inspectDoubaoStream } from '@datalom/platform-doubao/protocol';

const argv = process.argv.slice(2);
if (argv[0] === '--') argv.shift();
const [profileId, endpointValue, ...promptParts] = argv;
const prompt = promptParts.join(' ').trim();
const runId = randomUUID();
const store = await openStore();
let exitCode = 0;

const localEndpoint = (value: string) => {
  const endpoint = new URL(value);
  if (
    !['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password
  )
    throw new DatalomError('INVALID_INPUT', 'CDP 端点必须是 RoxyBrowser 返回的本机地址');
  return endpoint.toString();
};

try {
  if (!profileId || !endpointValue || !prompt)
    throw new DatalomError(
      'INVALID_INPUT',
      '用法：roxy-guest-chat <dirid> <cdp-endpoint> <message>',
    );
  const endpoint = localEndpoint(endpointValue);
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
  const context = browser.contexts()[0];
  const page = context?.pages().find((candidate) => {
    try {
      const url = new URL(candidate.url());
      return url.hostname === 'www.doubao.com' && url.pathname.startsWith('/chat');
    } catch {
      return false;
    }
  });
  if (!context || !page) throw new DatalomError('INVALID_INPUT', '当前 Profile 没有豆包聊天页面');

  const anonymous = assertDoubaoAnonymousCookies(await context.cookies('https://www.doubao.com/'));
  const loginVisible = await page
    .getByRole('button', { name: '登录', exact: true })
    .isVisible()
    .catch(() => false);
  if (!loginVisible)
    throw new DatalomError('LOGIN_REQUIRED', '页面未显示游客态登录入口，已停止发送');

  const previous = (await store.diagnostics.find(row => ['doubao-reference','doubao-roxy-guest-http'].includes(row.stage) && ['imported','received'].includes(row.outcome), 1, true).then(rows => rows[0])) as { id: string } | undefined;
  let previousBogus: string | null = null;
  if (previous) {
    const raw = (await store.diagnostics.rawEvent(previous.id)) as any;
    if (raw?.url) previousBogus = new URL(raw.url).searchParams.get('a_bogus');
  }

  let settle: ((response: Response) => void) | undefined;
  const responsePromise = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  const onResponse = (response: Response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (
      request.method() === 'POST' &&
      url.hostname === 'www.doubao.com' &&
      url.pathname === '/chat/completion'
    )
      settle?.(response);
  };
  page.on('response', onResponse);
  try {
    const composer = page.locator('[contenteditable="true"]:visible');
    if ((await composer.count()) !== 1)
      throw new DatalomError('SCHEMA_CHANGED', '豆包消息输入框数量不符合预期，已停止发送');
    await composer.fill(prompt);
    await composer.press('Enter');
    const response = await Promise.race([
      responsePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DatalomError('DEADLINE', '等待豆包响应超时')), 30000),
      ),
    ]);
    const request = response.request();
    const [body, requestHeaders, responseHeaders] = await Promise.all([
      response.text(),
      request.allHeaders(),
      response.allHeaders(),
    ]);
    const result = inspectDoubaoStream(response.status(), body);
    const currentBogus = new URL(request.url()).searchParams.get('a_bogus');
    const evidenceId = await store.diagnostics.event(
      { requestId: runId },
      'doubao-roxy-guest-http',
      'received',
      {
        profileId,
        anonymousCookieNames: anonymous.cookieNames,
        url: request.url(),
        method: request.method(),
        headers: requestHeaders,
        requestBody: request.postData(),
        status: response.status(),
        responseHeaders,
        body,
      },
    );
    const signature = {
      present: !!currentBogus,
      changedFromPrevious: !!currentBogus && !!previousBogus && currentBogus !== previousBogus,
      sha256: currentBogus ? createHash('sha256').update(currentBogus).digest('hex') : null,
    };
    if (!result.success)
      throw new DatalomError('RESEARCH_REQUIRED', `豆包游客请求未成功：${result.classification}`, {
        cause: { evidenceId, result, signature },
      });
    console.log(
      JSON.stringify({
        status: 'succeeded',
        profileId,
        anonymous: true,
        accountCookies: anonymous.accountCookies,
        signature,
        answer: result.answer,
        eventCount: result.events.length,
        evidenceId,
      }),
    );
  } finally {
    page.off('response', onResponse);
  }
} catch (error) {
  const evidenceId = await store.diagnostics.event(
    { requestId: runId },
    'doubao-roxy-guest-chat',
    'failed',
    { profileId, error: errorRecord(error) },
    error instanceof DatalomError ? error.code : 'INTERNAL',
  );
  console.error(
    JSON.stringify({
      status: 'failed',
      evidenceId,
      code: error instanceof DatalomError ? error.code : 'INTERNAL',
      message: error instanceof Error ? error.message : 'unknown',
    }),
  );
  exitCode = 1;
} finally {
  await store.close();
}

process.exit(exitCode);
