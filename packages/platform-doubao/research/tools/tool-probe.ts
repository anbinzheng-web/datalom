import { artifactPath } from '@datalom/shared/runtime/paths';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openStore } from '@datalom/shared/storage/runtime';
import { DatalomError } from '@datalom/shared/runtime/contracts';
import { errorRecord } from '@datalom/shared/runtime/diagnostics';
import { DoubaoSessions, assertGuestJar } from '@datalom/platform-doubao/session';
import {
  DoubaoNative,
  buildDoubaoMessage,
  loadDoubaoSDK,
  sha256,
} from '@datalom/platform-doubao/native';
import { inspectDoubaoStream, parseDoubaoSSE } from '@datalom/platform-doubao/protocol';

// An explicit, single-message protocol experiment. The OpenAI-shaped fields
// below are hypotheses, not claimed Doubao contracts. No tool side effects.
const [mode, sessionId = 'guest-node'] = process.argv.slice(2);
const modes = ['baseline', 'builtin-search', 'custom-tools', 'custom-functions', 'openai-format'];
const store = await openStore();
const sessions = new DoubaoSessions(store);
const runId = randomUUID();
let lease: string | undefined;
try {
  if (!modes.includes(mode)) throw new DatalomError('INVALID_INPUT', `mode: ${modes.join(' | ')}`);
  const acquired = await sessions.acquire(sessionId);
  lease = acquired.lease;
  const { session } = acquired;
  const client = new DoubaoNative(
    store,
    session,
    await loadDoubaoSDK(store),
    async () => await sessions.save(session, lease!),
  );
  assertGuestJar(client.jar);
  const probeKey = `probe_${randomUUID().slice(0, 8)}`;
  const functionName = 'datalom_lookup_probe';
  const prompt =
    mode === 'baseline'
      ? '只回复：TOOL-PROBE-BASELINE-OK'
      : mode === 'builtin-search'
        ? '请实际使用联网搜索工具查询 Node.js 官网目前标注的最新 LTS 版本号。请给出搜索来源链接；如果不能联网，直接说明不能联网，不要凭记忆回答。'
        : `请调用本次请求提供的 ${functionName} 工具，参数 probe_key 为 ${probeKey}。该值只能从调用方的本地工具取得，请输出结构化工具调用并等待工具结果；不要猜测结果，不要把调用写成普通文本或代码示例。`;
  let body: any = buildDoubaoMessage(prompt);
  const definition = {
    name: functionName,
    description:
      "Read the opaque probe value from the caller's local test fixture. The model does not know the value until the caller returns the tool result.",
    parameters: {
      type: 'object',
      properties: { probe_key: { type: 'string', enum: [probeKey] } },
      required: ['probe_key'],
      additionalProperties: false,
    },
  };
  if (mode === 'custom-tools') {
    body.tools = [{ type: 'function', function: definition }];
    body.tool_choice = { type: 'function', function: { name: functionName } };
  }
  if (mode === 'custom-functions') {
    body.functions = [definition];
    body.function_call = { name: functionName };
  }
  if (mode === 'openai-format') {
    body = {
      // Experimental model string; the website has no verified OpenAI model ID.
      model: 'doubao',
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'function', function: definition }],
      tool_choice: { type: 'function', function: { name: functionName } },
      stream: true,
    };
  }
  const requestBody = JSON.stringify(body);
  const url = await client.signer.sign(
    `https://www.doubao.com/chat/completion?${new URLSearchParams(session.params)}`,
    requestBody,
  );
  const headers = {
    'user-agent': session.userAgent,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    'agw-js-conv': 'str',
    origin: 'https://www.doubao.com',
    referer: 'https://www.doubao.com/chat/',
    cookie: client.jar.getCookieStringSync(url),
  };
  await store.diagnostics.event({ requestId: runId }, 'doubao-tool-probe', 'started', {
    mode,
    url,
    headers,
    requestBody,
    browserUsed: false,
    transport: 'node-fetch',
  });
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(90000),
    redirect: 'error',
  });
  for (const cookie of response.headers.getSetCookie()) client.jar.setCookieSync(cookie, url);
  session.cookieJar = client.jar.serializeSync()!;
  await sessions.save(session, lease);
  const responseBody = await response.text();
  const evidenceId = await store.diagnostics.event(
    { requestId: runId },
    'doubao-tool-probe',
    'received',
    {
      mode,
      url,
      requestBody,
      status: response.status,
      responseHeaders: Object.fromEntries(response.headers),
      body: responseBody,
    },
  );
  // OpenAI streams can terminate with a non-JSON [DONE] sentinel. Keep the
  // original bytes in evidence, but exclude that sentinel from JSON parsing.
  const parseBody = responseBody.replace(/^data:\s*\[DONE\]\r?$/gm, '');
  const events = response.headers.get('content-type')?.includes('text/event-stream')
    ? parseDoubaoSSE(parseBody)
    : [];
  const blockTypes = new Set<number>();
  const hints: Array<{
    event: string;
    path: string;
    shape: string[] | string;
  }> = [];
  const customCalls: Array<{
    event: string;
    path: string;
    name: string;
    arguments: unknown;
  }> = [];
  const searchUrls = new Set<string>();
  const scan = (value: unknown, path: string, event: string, depth = 0) => {
    if (depth > 18) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`, event, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, any>;
    if (typeof obj.block_type === 'number') blockTypes.add(obj.block_type);
    if (
      obj.name === functionName &&
      (Object.hasOwn(obj, 'arguments') ||
        Object.hasOwn(obj, 'parameters') ||
        Object.hasOwn(obj, 'input'))
    )
      customCalls.push({
        event,
        path,
        name: functionName,
        arguments: obj.arguments ?? obj.parameters ?? obj.input,
      });
    for (const [key, child] of Object.entries(obj)) {
      const next = `${path}.${key}`;
      if (
        /tool_calls?|tool_choice|function_call|search_query|search_result|generic_tool|plugin_result/i.test(
          key,
        )
      )
        hints.push({
          event,
          path: next,
          shape:
            child && typeof child === 'object' ? Object.keys(child) : String(child).slice(0, 160),
        });
      if (
        /url|link/.test(key) &&
        typeof child === 'string' &&
        /^https?:\/\//.test(child) &&
        /search|result|reference/i.test(path)
      )
        searchUrls.add(child);
      if (
        typeof child === 'string' &&
        ['content', 'patch_value'].includes(key) &&
        /^[\[{]/.test(child)
      ) {
        try {
          scan(JSON.parse(child), `${next}(json)`, event, depth + 1);
        } catch {}
      } else if (!['text', 'brief'].includes(key)) scan(child, next, event, depth + 1);
    }
  };
  // User echo messages cannot prove the assistant invoked a tool.
  for (const event of events)
    if (event.event !== 'FULL_MSG_NOTIFY') scan(event.data, '$', event.event);
  let jsonResponse: any;
  if (!events.length) {
    try {
      jsonResponse = JSON.parse(responseBody);
      scan(jsonResponse, '$', 'json-response');
    } catch {}
  }
  const result = inspectDoubaoStream(response.status, parseBody);
  const summary = {
    mode,
    runId,
    evidenceId,
    browserUsed: false,
    transport: 'node-fetch',
    httpStatus: response.status,
    classification: result.classification,
    textAnswerComplete: result.success,
    businessCode: 'businessCode' in result ? result.businessCode : undefined,
    businessMessage: 'rawMessage' in result ? result.rawMessage : undefined,
    responseContentType: response.headers.get('content-type'),
    jsonResponse: jsonResponse
      ? {
          keys: Object.keys(jsonResponse),
          code: jsonResponse.code ?? jsonResponse.status_code,
          message: jsonResponse.msg ?? jsonResponse.message ?? jsonResponse.error?.message,
        }
      : undefined,
    requestExtensionKeys: Object.keys(body).filter(
      (key) => !['client_meta', 'messages', 'option', 'user_context', 'ext'].includes(key),
    ),
    eventCounts: events.reduce<Record<string, number>>(
      (counts, e) => ({ ...counts, [e.event]: (counts[e.event] ?? 0) + 1 }),
      {},
    ),
    blockTypes: [...blockTypes],
    structuredToolFields: hints.slice(0, 50),
    customCalls,
    customToolExecuted: false,
    structuredSearchUrls: [...searchUrls].slice(0, 12),
    answerLength: result.success ? result.answer.length : 0,
    answerSha256: result.success ? sha256(result.answer) : undefined,
    answerExcerpt: result.success ? result.answer.slice(0, 450) : undefined,
  };
  mkdirSync(artifactPath('doubao-node'), { recursive: true });
  writeFileSync(artifactPath(`doubao-node/tools-${mode}.json`), JSON.stringify(summary, null, 2));
  await store.diagnostics.event({ requestId: runId }, 'doubao-tool-probe', 'assessed', summary);
  console.log(JSON.stringify(summary));
  if ('businessCode' in result || response.status !== 200) process.exitCode = 1;
} catch (error) {
  const evidenceId = await store.diagnostics.event(
    { requestId: runId },
    'doubao-tool-probe',
    'failed',
    errorRecord(error),
  );
  console.error(
    JSON.stringify({
      status: 'failed',
      evidenceId,
      mode,
      message: error instanceof DatalomError ? error.message : '探测失败；详情见加密证据',
    }),
  );
  process.exitCode = 1;
} finally {
  if (lease) await sessions.release(sessionId, lease);
  await store.close();
}
